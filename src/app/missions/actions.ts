"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { listWorkspaces } from "@/app/workspaces/actions";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function context(workspaceId: string) {
  if (!UUID.test(workspaceId)) return null;
  const result = await listWorkspaces();
  if (result.status !== "ready" || !result.workspaces.some((space) => space.id === workspaceId)) return null;
  const supabase = await createSupabaseServerClient();
  if (!supabase) return null;
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  return { supabase, userId: user.id, role: result.workspaces.find((space) => space.id === workspaceId)!.role };
}
function returnTo(path: "missions" | "inbox", workspaceId: string, key: "created" | "updated" | "requested" | "decided" | "error"): never {
  revalidatePath("/missions");
  revalidatePath("/inbox");
  redirect("/" + path + "?workspaceId=" + encodeURIComponent(workspaceId) + "&result=" + key);
}

export async function createAtlasMission(formData: FormData) {
  const workspaceId = String(formData.get("workspaceId") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const priority = String(formData.get("priority") ?? "");
  if (!UUID.test(workspaceId) || title.length < 1 || title.length > 120 ||
    description.length > 1000 || !["normal", "high"].includes(priority)) {
    returnTo("missions", workspaceId, "error");
  }
  const ctx = await context(workspaceId);
  if (!ctx) returnTo("missions", workspaceId, "error");
  const { error } = await ctx.supabase.from("atlas_missions").insert({
    workspace_id: workspaceId, title, description, priority,
    created_by: ctx.userId,
  });
  returnTo("missions", workspaceId, error ? "error" : "created");
}

export async function updateAtlasMission(formData: FormData) {
  const workspaceId = String(formData.get("workspaceId") ?? "");
  const missionId = String(formData.get("missionId") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!UUID.test(missionId) || !["planned", "active", "done"].includes(status)) returnTo("missions", workspaceId, "error");
  const ctx = await context(workspaceId);
  if (!ctx) returnTo("missions", workspaceId, "error");
  const { data, error } = await ctx.supabase.from("atlas_missions")
    .update({ status }).eq("id", missionId).eq("workspace_id", workspaceId)
    .neq("status", "review").select("id");
  returnTo("missions", workspaceId, !error && data?.length ? "updated" : "error");
}

export async function requestAtlasMissionReview(formData: FormData) {
  const workspaceId = String(formData.get("workspaceId") ?? "");
  const missionId = String(formData.get("missionId") ?? "");
  if (!UUID.test(missionId)) returnTo("missions", workspaceId, "error");
  const ctx = await context(workspaceId);
  if (!ctx) returnTo("missions", workspaceId, "error");
  const { error } = await ctx.supabase.rpc("request_atlas_mission_review", { _mission_id: missionId });
  returnTo("missions", workspaceId, error ? "error" : "requested");
}

export async function decideAtlasMissionReview(formData: FormData) {
  const workspaceId = String(formData.get("workspaceId") ?? "");
  const reviewId = String(formData.get("reviewId") ?? "");
  const decision = String(formData.get("decision") ?? "");
  if (!UUID.test(reviewId) || !["approved", "rejected"].includes(decision)) returnTo("inbox", workspaceId, "error");
  const ctx = await context(workspaceId);
  if (!ctx || !["owner", "admin"].includes(ctx.role)) returnTo("inbox", workspaceId, "error");
  // The database RPC atomically updates the decision and the linked mission, under RLS.
  const { error } = await ctx.supabase.rpc("decide_atlas_mission_review", {
    _review_id: reviewId, _decision: decision,
  });
  returnTo("inbox", workspaceId, error ? "error" : "decided");
}
