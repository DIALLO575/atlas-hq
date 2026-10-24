import "server-only";
import { notionObservationListView } from "../../../packages/connectors/notion/src/observations-view.mjs";
import { matchesNotionResourceRef, type NotionResourceRef }
  from "../../../packages/connectors/notion/src/resource-reference.mjs";
import { adminNotionClient, notionConnectSettings,
  requireNotionWorkspaceActor } from "./connect";
import type { loadNotionPersonalConnection } from "./reader";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Service-only persistence. Never used as authorization for a future read.
 * The RPC verifies current admin membership, registry state and vault version
 * while locking the vault row against a concurrent refresh or revocation.
 */
export async function saveNotionResourceObservation(
  loaded: Awaited<ReturnType<typeof loadNotionPersonalConnection>>,
  ref: NotionResourceRef,
  version: number,
): Promise<boolean> {
  const { actor, admin, record } = loaded;
  const binding = {
    workspaceId: actor.workspaceId, actorId: actor.userId,
    connectionId: record.connection_id,
    notionWorkspaceId: record.notion_workspace_id,
    surface: "rest" as const, credential: "notion_rest_oauth" as const,
    active: true,
  };
  if (!matchesNotionResourceRef(ref, binding, ref.kind, ref.resourceId) ||
      !Number.isSafeInteger(version) || version < 1) return false;
  const { data, error } = await admin.rpc("atlas_notion_record_resource_observation", {
    p_connection_id: record.connection_id,
    p_workspace_id: actor.workspaceId,
    p_user_id: actor.userId,
    p_notion_workspace_id: record.notion_workspace_id,
    p_connection_version: version,
    p_resource_kind: ref.kind,
    p_resource_id: ref.resourceId,
    p_source_updated_at: ref.sourceVersion,
  });
  return !error && data === true;
}

/**
 * Read-only references for Chief/Missions. Admin personal records only; never
 * grants access to a Notion page or leaks content/credential to the browser.
 */
export async function listPersonalNotionObservations(workspaceId: string) {
  if (!UUID.test(workspaceId)) return [];
  const actor = await requireNotionWorkspaceActor(workspaceId);
  if (!actor) return [];
  const settings = notionConnectSettings();
  if (!settings || !settings.callbackEnabled) return [];
  const admin = adminNotionClient(settings);
  const { data, error } = await admin.rpc("atlas_notion_list_resource_observations", {
    p_workspace_id: actor.workspaceId,
    p_user_id: actor.userId,
    p_limit: 8,
  });
  if (error) throw new Error("NOTION_OBSERVATIONS_UNAVAILABLE");
  return notionObservationListView(data, 8);
}
