import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { consumeLinearOAuthState, createLinearOAuthState } from "../../../packages/connectors/linear/src/oauth-state.mjs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const linearConnectCookieName = "atlas_linear_oauth_state";
export const linearPkceCookieName = "atlas_linear_pkce_verifier";
export const LINEAR_CALLBACK_PATH = "/api/apps/linear/connect/oauth";

export function linearConnectSettings() {
  const publicOrigin = process.env.ATLAS_PUBLIC_ORIGIN;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const clientId = process.env.LINEAR_OAUTH_CLIENT_ID;
  const redirectUri = process.env.LINEAR_OAUTH_REDIRECT_URI;
  const stateKey = process.env.LINEAR_OAUTH_STATE_KEY;
  if (!publicOrigin || !url || !serviceKey || !clientId || !redirectUri || !stateKey ||
      Buffer.byteLength(stateKey) < 32) return null;
  try {
    const origin = new URL(publicOrigin);
    const callback = new URL(redirectUri);
    if (origin.origin !== publicOrigin.replace(/\/$/, "") || origin.protocol !== "https:" ||
        callback.toString() !== redirectUri || redirectUri !== `${origin.origin}${LINEAR_CALLBACK_PATH}` ||
        callback.username || callback.password || callback.search || callback.hash) return null;
    return { publicOrigin: origin.origin, url, serviceKey, clientId, redirectUri, stateKey };
  } catch {
    return null;
  }
}

export function adminLinearStateClient(settings: NonNullable<ReturnType<typeof linearConnectSettings>>) {
  return createClient(settings.url, settings.serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
}

export async function requireLinearWorkspaceAdmin(workspaceId: string) {
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

export async function requireLinearWorkspaceAdminForState(admin: SupabaseClient, stateHash: string) {
  const client = await createSupabaseServerClient();
  if (!client) return null;
  const { data: { user }, error: identityError } = await client.auth.getUser();
  if (identityError || !user) return null;
  // Resolve only a state owned by this authenticated actor; state contains no tenant or user identifiers.
  const { data: pending, error: stateError } = await admin.from("atlas_linear_oauth_states")
    .select("workspace_id")
    .eq("state_hash", stateHash).eq("user_id", user.id)
    .is("consumed_at", null).gt("expires_at", new Date().toISOString()).maybeSingle();
  if (stateError || !pending || !UUID.test(pending.workspace_id)) return null;
  const { data: membership, error: membershipError } = await client.from("workspace_members")
    .select("role").eq("workspace_id", pending.workspace_id).eq("user_id", user.id).maybeSingle();
  if (membershipError || !membership || !["owner", "admin"].includes(membership.role)) return null;
  return { workspaceId: pending.workspace_id, userId: user.id };
}

export function linearStateStore(admin: SupabaseClient) {
  return {
    async insertPendingState(record: { stateHash: string; workspaceId: string; userId: string; expiresAt: string }) {
      const { error } = await admin.from("atlas_linear_oauth_states").insert({
        state_hash: record.stateHash,
        workspace_id: record.workspaceId,
        user_id: record.userId,
        expires_at: record.expiresAt,
      });
      if (error) throw new Error("LINEAR_STATE_STORE_UNAVAILABLE");
    },
    async consumePendingState(record: { stateHash: string; workspaceId: string; userId: string; now: string }) {
      // A single conditional UPDATE is the replay barrier across concurrent workers.
      const { data, error } = await admin.from("atlas_linear_oauth_states")
        .update({ consumed_at: record.now })
        .eq("state_hash", record.stateHash)
        .eq("workspace_id", record.workspaceId)
        .eq("user_id", record.userId)
        .is("consumed_at", null)
        .gt("expires_at", record.now)
        .select("state_hash").maybeSingle();
      return !error && Boolean(data);
    },
  };
}

export async function registerLinearOAuthState(admin: SupabaseClient, args: {
  workspaceId: string; userId: string; stateKey: string;
}) {
  return createLinearOAuthState({ ...args, key: args.stateKey, store: linearStateStore(admin) });
}

export async function consumeRegisteredLinearOAuthState(admin: SupabaseClient, args: {
  state: string; cookieState: string; workspaceId: string; userId: string; stateKey: string;
}) {
  return consumeLinearOAuthState({ ...args, key: args.stateKey, store: linearStateStore(admin) });
}

export function linearConnectRedirect(settings: NonNullable<ReturnType<typeof linearConnectSettings>>, result: string) {
  const allowed = new Set(["callback-disabled", "invalid-state", "forbidden", "oauth-denied", "unavailable"]);
  const url = new URL("/apps", settings.publicOrigin);
  url.searchParams.set("linear", allowed.has(result) ? result : "unavailable");
  return url;
}
