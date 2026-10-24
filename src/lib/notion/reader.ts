import "server-only";
import { createNotionReadClient } from "../../../packages/connectors/notion/src/rest-client.mjs";
import { assertPersonalNotionConnection } from "../../../packages/connectors/notion/src/resource-view.mjs";
import { adminNotionClient, notionConnectSettings, notionTokenVault,
  requireNotionWorkspaceActor } from "./connect";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export class NotionConnectionAccessError extends Error {
  constructor(public readonly code: string) { super(code); }
}
export async function loadNotionPersonalConnection({
  workspaceId, connectionId,
}: { workspaceId: string; connectionId: string }) {
  if (!UUID.test(workspaceId) || !UUID.test(connectionId)) {
    throw new NotionConnectionAccessError("INVALID_REQUEST");
  }
  const actor = await requireNotionWorkspaceActor(workspaceId);
  if (!actor) throw new NotionConnectionAccessError("FORBIDDEN");
  const settings = notionConnectSettings();
  const vault = notionTokenVault();
  if (!settings || !settings.callbackEnabled || !vault) {
    throw new NotionConnectionAccessError("NOT_CONFIGURED");
  }
  const admin = adminNotionClient(settings);
  const { data: connection, error: credentialError } = await admin.from("atlas_notion_connections")
    .select("*").eq("connection_id", connectionId).eq("workspace_id", actor.workspaceId)
    .eq("user_id", actor.userId).is("revoked_at", null).maybeSingle();
  if (credentialError) throw new NotionConnectionAccessError("STORE_UNAVAILABLE");
  if (!connection) throw new NotionConnectionAccessError("NOT_FOUND");
  const { data: registry, error: registryError } = await admin.from("atlas_connections")
    .select("id,owner_id,workspace_id,provider,status")
    .eq("id", connectionId).eq("workspace_id", actor.workspaceId)
    .eq("owner_id", actor.userId).eq("provider", "notion").maybeSingle();
  if (registryError) throw new NotionConnectionAccessError("STORE_UNAVAILABLE");
  try { assertPersonalNotionConnection({ connection, registry, actor, connectionId }); }
  catch { throw new NotionConnectionAccessError("NOT_FOUND"); }
  const tokens = vault.decryptTokens(connection, {
    atlasWorkspaceId: actor.workspaceId,
    actorUserId: actor.userId,
    notionWorkspaceId: connection.notion_workspace_id,
    notionBotId: connection.notion_bot_id,
  });
  return {
    actor, settings, admin, vault, record: connection, tokens,
    client: createNotionReadClient({ token: tokens.accessToken }),
  };
}
