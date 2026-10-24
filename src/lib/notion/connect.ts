import "server-only";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { NOTION_OAUTH_CALLBACK_PATH } from "../../../packages/connectors/notion/src/oauth.mjs";
import { createNotionOAuthState, consumeNotionOAuthState,
  readNotionOAuthState } from "../../../packages/connectors/notion/src/oauth-state.mjs";
import { notionTokenVaultFromEnvironment } from "../../../packages/connectors/notion/src/token-vault.mjs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const NOTION_OAUTH_COOKIE = "atlas_notion_rest_oauth_state";

export function notionConnectSettings() {
  const publicOrigin = process.env.ATLAS_PUBLIC_ORIGIN ?? "";
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  const clientId = process.env.NOTION_OAUTH_CLIENT_ID ?? "";
  const clientSecret = process.env.NOTION_OAUTH_CLIENT_SECRET ?? "";
  const redirectUri = process.env.NOTION_OAUTH_REDIRECT_URI ?? "";
  const stateKey = process.env.NOTION_OAUTH_STATE_KEY ?? "";
  if (!url || !serviceKey || !UUID.test(clientId) || !clientSecret ||
      Buffer.byteLength(stateKey) < 32 || !publicOrigin) return null;
  try {
    const origin = new URL(publicOrigin);
    const callback = new URL(redirectUri);
    if (origin.origin !== publicOrigin.replace(/\/$/, "") ||
        (origin.protocol !== "https:" && !(process.env.NODE_ENV !== "production" &&
          origin.protocol === "http:" && ["localhost", "127.0.0.1"].includes(origin.hostname))) ||
        redirectUri !== origin.origin + NOTION_OAUTH_CALLBACK_PATH ||
        callback.username || callback.password || callback.search || callback.hash) return null;
    return {
      publicOrigin: origin.origin, url, serviceKey, clientId, clientSecret,
      redirectUri, stateKey,
      callbackEnabled: process.env.NOTION_OAUTH_CALLBACK_ENABLED === "true",
    };
  } catch { return null; }
}

export function notionTokenVault() {
  try { return notionTokenVaultFromEnvironment(); } catch { return null; }
}

export function adminNotionClient(settings: NonNullable<ReturnType<typeof notionConnectSettings>>) {
  return createClient(settings.url, settings.serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
}

export async function requireNotionWorkspaceActor(workspaceId: string, adminOnly = true) {
  if (!UUID.test(workspaceId)) return null;
  const client = await createSupabaseServerClient();
  if (!client) return null;
  const { data: { user }, error: authError } = await client.auth.getUser();
  if (authError || !user) return null;
  const { data: member, error } = await client.from("workspace_members")
    .select("role").eq("workspace_id", workspaceId).eq("user_id", user.id).maybeSingle();
  if (error || !member || !["owner", "admin", "member"].includes(member.role) ||
      (adminOnly && !["owner", "admin"].includes(member.role))) return null;
  return { workspaceId, userId: user.id, role: member.role };
}

type AdminNotion = ReturnType<typeof adminNotionClient>;
export function notionStateStore(admin: AdminNotion) {
  return {
    async insertPendingState(row: {
      stateHash: string; workspaceId: string; userId: string; expiresAt: string;
    }) {
      const { error } = await admin.from("atlas_notion_oauth_states").insert({
        state_hash: row.stateHash, workspace_id: row.workspaceId,
        user_id: row.userId, expires_at: row.expiresAt,
      });
      if (error) throw new Error("NOTION_OAUTH_STATE_UNAVAILABLE");
    },
    async consumePendingState(row: {
      stateHash: string; workspaceId: string; userId: string; now: string;
    }) {
      const { data, error } = await admin.from("atlas_notion_oauth_states")
        .update({ consumed_at: row.now }).eq("state_hash", row.stateHash)
        .eq("workspace_id", row.workspaceId).eq("user_id", row.userId)
        .is("consumed_at", null).gt("expires_at", row.now)
        .select("state_hash").maybeSingle();
      return !error && Boolean(data);
    },
  };
}
export async function createRegisteredNotionState(admin: AdminNotion, args: {
  workspaceId: string; userId: string; key: string;
}) {
  return createNotionOAuthState({ ...args, store: notionStateStore(admin) });
}
export async function validateAndConsumeNotionCallback(
  admin: AdminNotion, args: {
    state: string; cookieState: string; key: string;
  },
) {
  const proof = readNotionOAuthState(args);
  if (!proof) return null;
  const { data, error } = await admin.from("atlas_notion_oauth_states")
    .select("workspace_id,user_id")
    .eq("state_hash", proof.stateHash).is("consumed_at", null)
    .gt("expires_at", new Date().toISOString()).maybeSingle();
  if (error || !data) return null;
  // The callback must still belong to the same logged-in ATLAS actor and
  // the actor must still be an admin of this exact workspace.
  const actor = await requireNotionWorkspaceActor(data.workspace_id);
  if (!actor || actor.userId !== data.user_id) return null;
  const consumed = await consumeNotionOAuthState({
    ...args, workspaceId: actor.workspaceId, userId: actor.userId,
    store: notionStateStore(admin),
  });
  return consumed ? actor : null;
}
