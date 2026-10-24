import "server-only";
import { createHash } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  createInstallationState, readInstallationState,
} from "../../../packages/connectors/github/src/installation-flow.mjs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const githubConnectCookieName = "atlas_github_connect";
type Stage = "installation" | "oauth";

export function githubConnectSettings() {
  const publicOrigin = process.env.ATLAS_PUBLIC_ORIGIN;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const appSlug = process.env.GITHUB_APP_SLUG;
  const appId = process.env.GITHUB_APP_ID;
  const appPrivateKey = process.env.GITHUB_APP_PRIVATE_KEY;
  const clientId = process.env.GITHUB_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GITHUB_OAUTH_CLIENT_SECRET;
  const stateKey = process.env.GITHUB_INSTALL_STATE_KEY;
  if (!publicOrigin || !url || !key || !appSlug || !appId || !appPrivateKey ||
      !clientId || !clientSecret || !stateKey || stateKey.length < 32) return null;
  try {
    const origin = new URL(publicOrigin);
    if (origin.origin !== publicOrigin.replace(/\/$/, "") ||
        (origin.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(origin.hostname))) return null;
    return { publicOrigin: origin.origin, url, key, appSlug, appId, appPrivateKey,
      clientId, clientSecret, stateKey };
  } catch {
    return null;
  }
}

export function adminGitHubClient(settings: NonNullable<ReturnType<typeof githubConnectSettings>>) {
  return createClient(settings.url, settings.key, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
}

export async function requireWorkspaceAdmin(workspaceId: string) {
  if (!UUID.test(workspaceId)) return null;
  const client = await createSupabaseServerClient();
  if (!client) return null;
  const { data: { user }, error: identityError } = await client.auth.getUser();
  if (identityError || !user) return null;
  const { data, error } = await client.from("workspace_members").select("role")
    .eq("workspace_id", workspaceId).eq("user_id", user.id).maybeSingle();
  if (error || !data || !["owner", "admin"].includes(data.role)) return null;
  return { workspaceId, userId: user.id };
}

function stateHash(state: string) {
  return createHash("sha256").update(state).digest("hex");
}

export function readConnectState(
  state: string, stateKey: string,
) {
  return readInstallationState(state, stateKey);
}

export async function registerConnectAttempt(
  admin: SupabaseClient, args: { workspaceId: string; userId: string; stateKey: string; stage: Stage; installationId?: number },
) {
  const state = createInstallationState({ tenantId: args.workspaceId, key: args.stateKey });
  const proof = readConnectState(state, args.stateKey);
  if (!proof) throw new Error("Invalid state");
  const { error } = await admin.from("atlas_github_connect_attempts").insert({
    state_hash: stateHash(state),
    workspace_id: args.workspaceId,
    user_id: args.userId,
    stage: args.stage,
    installation_id: args.installationId ?? null,
    expires_at: new Date(proof.exp * 1000).toISOString(),
  });
  if (error) throw new Error("Could not store GitHub authorization state");
  return state;
}

export async function consumeConnectAttempt(
  admin: SupabaseClient, args: {
    workspaceId: string; userId: string; state: string; stateKey: string; stage: Stage;
  },
): Promise<{ installationId: number | null } | null> {
  const proof = readConnectState(args.state, args.stateKey);
  if (!proof || proof.tenantId !== args.workspaceId) return null;
  // Atomic update is the replay barrier; precisely one request can consume this state.
  const { data, error } = await admin.from("atlas_github_connect_attempts")
    .update({ stage: "consumed" })
    .eq("state_hash", stateHash(args.state))
    .eq("workspace_id", args.workspaceId)
    .eq("user_id", args.userId)
    .eq("stage", args.stage)
    .gt("expires_at", new Date().toISOString())
    .select("installation_id").maybeSingle();
  if (error || !data) return null;
  return { installationId: data.installation_id };
}

export async function persistVerifiedPersonalInstallation(admin: SupabaseClient, {
  workspaceId, installationId, repositoryIds, repositorySelection,
}: { workspaceId: string; installationId: number; repositoryIds: number[]; repositorySelection: "selected" | "all" }) {
  if (!Number.isSafeInteger(installationId) || installationId < 1 ||
      !["selected", "all"].includes(repositorySelection) ||
      !Array.isArray(repositoryIds) || repositoryIds.length > 500 ||
      (repositorySelection === "selected" && repositoryIds.length === 0) ||
      (repositorySelection === "all" && repositoryIds.length !== 0) ||
      repositoryIds.some((id) => !Number.isSafeInteger(id) || id < 1) ||
      new Set(repositoryIds).size !== repositoryIds.length) throw new Error("Invalid GitHub selection");

  // Never upsert another workspace's installation; installation_id is globally unique.
  const { data: existing, error: lookupError } = await admin
    .from("atlas_github_installations").select("workspace_id")
    .eq("installation_id", installationId).maybeSingle();
  if (lookupError) throw new Error("Installation lookup failed");
  if (existing && existing.workspace_id !== workspaceId) throw new Error("Installation already assigned");

  const now = new Date().toISOString();
  const base = {
    workspace_id: workspaceId,
    status: "active",
    repository_selection: repositorySelection,
    ownership_verified_at: now,
    repositories_verified_at: null,
    updated_at: now,
  };
  if (existing) {
    const { data, error } = await admin.from("atlas_github_installations")
      .update(base).eq("installation_id", installationId).eq("workspace_id", workspaceId)
      .select("installation_id").maybeSingle();
    if (error || !data) throw new Error("Could not begin installation reconciliation");
  } else {
    const { error } = await admin.from("atlas_github_installations")
      .insert({ installation_id: installationId, ...base });
    if (error) throw new Error("Could not claim verified installation");
  }

  // Fail closed: set 'repositories-ready' ONLY after the exact confirmed IDs
  // are written. A mid-process failure leaves status 'active' and all reads blocked.
  const { error: clearError } = await admin.from("atlas_github_authorized_repositories")
    .delete().eq("installation_id", installationId);
  if (clearError) throw new Error("Cannot refresh authorized repositories");
  // For "all", GitHub owns the complete (and future) repository grant.
  // No static repository IDs are persisted; the installation token and live
  // /installation/repositories endpoint enforce current access on every read.
  if (repositorySelection === "selected") {
    const { error: insertError } = await admin.from("atlas_github_authorized_repositories")
      .insert(repositoryIds.map((id) => ({ installation_id: installationId, repository_id: id })));
    if (insertError) throw new Error("Cannot store authorized repositories");
  }
  const { data: ready, error: readyError } = await admin.from("atlas_github_installations")
    .update({ status: "repositories-ready", repositories_verified_at: now, updated_at: now })
    .eq("installation_id", installationId).eq("workspace_id", workspaceId)
    .eq("status", "active").select("installation_id").maybeSingle();
  if (readyError || !ready) throw new Error("Installation not ready");
}

export function connectorRedirect(settings: NonNullable<ReturnType<typeof githubConnectSettings>>, code: string) {
  const url = new URL("/apps/github", settings.publicOrigin);
  url.searchParams.set("github", code);
  return url;
}
