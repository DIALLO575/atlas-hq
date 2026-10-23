"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Workspace, WorkspaceResult } from "@/lib/workspaces/contract";

async function resolveWorkspaces(): Promise<{ userId: string; workspaces: Workspace[] } | null> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return null;

  // getUser validates the access token with Supabase Auth; never accept an id from the browser.
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return null;

  const { data, error } = await supabase
    .from("workspace_members")
    .select("workspace_id, role, workspaces!inner(id, name)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });

  if (error || !data) throw new Error("Workspace lookup failed");

  const workspaces = data.flatMap((membership) => {
    const workspace = Array.isArray(membership.workspaces) ? membership.workspaces[0] : membership.workspaces;
    if (!workspace || !["owner", "admin", "member"].includes(membership.role)) return [];
    return [{ id: workspace.id, name: workspace.name, role: membership.role as Workspace["role"] }];
  });

  return { userId: user.id, workspaces };
}

export async function listWorkspaces(): Promise<WorkspaceResult> {
  try {
    const result = await resolveWorkspaces();
    if (!result) return { status: "error", message: "Session utilisateur indisponible." };
    return { status: "ready", workspaces: result.workspaces, selectedId: result.workspaces[0]?.id ?? "" };
  } catch {
    return { status: "error", message: "Impossible de charger les workspaces." };
  }
}

export async function selectWorkspace(workspaceId: string): Promise<WorkspaceResult> {
  try {
    const result = await resolveWorkspaces();
    if (!result) return { status: "error", message: "Session utilisateur indisponible." };
    const selected = result.workspaces.find((workspace) => workspace.id === workspaceId);
    if (!selected) return { status: "error", message: "Workspace indisponible pour cet utilisateur." };
    return { status: "ready", workspaces: result.workspaces, selectedId: selected.id };
  } catch {
    return { status: "error", message: "Impossible de changer de workspace." };
  }
}

export async function createWorkspace(name: string): Promise<WorkspaceResult> {
  const cleanName = name.trim();
  if (cleanName.length < 1 || cleanName.length > 120) {
    return { status: "error", message: "Le nom du workspace doit contenir de 1 à 120 caractères." };
  }
  try {
    const resolved = await resolveWorkspaces();
    if (!resolved) return { status: "error", message: "Session utilisateur indisponible." };
    const supabase = await createSupabaseServerClient();
    if (!supabase) return { status: "error", message: "Configuration Supabase indisponible." };
    const { data: created, error } = await supabase.from("workspaces")
      .insert({ name: cleanName, created_by: resolved.userId }).select("id").single();
    if (error || !created) return { status: "error", message: "Impossible de créer le workspace." };
    const result = await resolveWorkspaces();
    if (!result) return { status: "error", message: "Session utilisateur indisponible." };
    return { status: "ready", workspaces: result.workspaces, selectedId: created.id };
  } catch {
    return { status: "error", message: "Impossible de créer le workspace." };
  }
}

/** The existing createWorkspace() remains the authority for session/RLS checks. */
export async function createWorkspaceFromForm(formData: FormData) {
  const name = String(formData.get("name") ?? "");
  const result = await createWorkspace(name);
  if (result.status === "ready") {
    revalidatePath("/workspaces");
    revalidatePath("/apps");
    redirect("/workspaces");
  }
  redirect("/workspaces?createError=1");
}
