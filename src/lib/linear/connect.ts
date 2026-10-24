import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { consumeLinearOAuthState, createLinearOAuthState } from "../../../packages/connectors/linear/src/oauth-state.mjs";
import { LINEAR_CALLBACK_PATH, LINEAR_PKCE_COOKIE, LINEAR_STATE_COOKIE,
  verifyLinearStateActor, verifyLinearWorkspaceAdmin } from "../../../packages/connectors/linear/src/connect-routes.mjs";
import { linearTokenVaultFromEnvironment } from "../../../packages/connectors/linear/src/token-vault.mjs";

export const linearConnectCookieName = LINEAR_STATE_COOKIE;
export const linearPkceCookieName = LINEAR_PKCE_COOKIE;

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
    return {
      publicOrigin: origin.origin, url, serviceKey, clientId, redirectUri, stateKey,
      clientSecret: process.env.LINEAR_OAUTH_CLIENT_SECRET,
      callbackEnabled: process.env.LINEAR_OAUTH_CALLBACK_ENABLED === "true",
    };
  } catch {
    return null;
  }
}

export function linearTokenVault() {
  try { return linearTokenVaultFromEnvironment(); } catch { return null; }
}

export function adminLinearStateClient(settings: NonNullable<ReturnType<typeof linearConnectSettings>>) {
  return createClient(settings.url, settings.serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
}

export async function requireLinearWorkspaceAdmin(workspaceId: string) {
  const client = await createSupabaseServerClient();
  if (!client) return null;
  return verifyLinearWorkspaceAdmin(client, workspaceId);
}

export async function requireLinearWorkspaceAdminForState(admin: SupabaseClient, stateHash: string) {
  const client = await createSupabaseServerClient();
  if (!client) return null;
  return verifyLinearStateActor({ client, admin, stateHash });
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
  workspaceId: string; userId: string; stateKey: string; now?: number;
}) {
  return createLinearOAuthState({ ...args, key: args.stateKey, store: linearStateStore(admin) });
}

export async function consumeRegisteredLinearOAuthState(admin: SupabaseClient, args: {
  state: string; cookieState: string; workspaceId: string; userId: string; stateKey: string;
}) {
  return consumeLinearOAuthState({ ...args, key: args.stateKey, store: linearStateStore(admin) });
}

export function linearConnectRedirect(settings: NonNullable<ReturnType<typeof linearConnectSettings>>, result: string) {
  const allowed = new Set(["callback-disabled", "connected", "invalid-state", "forbidden", "oauth-denied", "unavailable"]);
  const url = new URL("/apps", settings.publicOrigin);
  url.searchParams.set("linear", allowed.has(result) ? result : "unavailable");
  return url;
}


export async function assertLinearConnectionStoreReady(admin: SupabaseClient, actor: { workspaceId: string; userId: string }) {
  const { error } = await admin.from("atlas_linear_connections")
    .select("version").eq("workspace_id", actor.workspaceId).eq("user_id", actor.userId).maybeSingle();
  if (error) throw new Error("LINEAR_CONNECTION_STORE_UNAVAILABLE");
}
