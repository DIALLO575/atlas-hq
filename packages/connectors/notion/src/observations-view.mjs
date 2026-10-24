/** Historical Notion object metadata is NOT a permission proof.
 * A listing may be displayed only after live ATLAS membership + vault state
 * checks in the SQL RPC and authenticated Next.js loader.
 */
const UUID = /^(?:[0-9a-f]{32}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;
const KINDS = new Set(["page", "block", "database", "data_source"]);
function validDate(value) {
  return typeof value === "string" && value.length <= 35 &&
    Number.isFinite(Date.parse(value));
}
export function notionObservationListView(raw, maxItems = 10) {
  if (!Array.isArray(raw) || !Number.isInteger(maxItems) ||
      maxItems < 1 || maxItems > 20) throw new Error("NOTION_OBSERVATIONS_INVALID");
  return Object.freeze(raw.slice(0,maxItems).flatMap(item => {
    if (!item || !UUID.test(item.connection_id ?? "") ||
      !UUID.test(item.resource_id ?? "") || !UUID.test(item.notion_workspace_id ?? "") ||
      !KINDS.has(item.resource_kind) ||
      !validDate(item.observed_at) ||
      (item.source_updated_at !== null && item.source_updated_at !== undefined &&
        !validDate(item.source_updated_at))) return [];
    return [Object.freeze({
      connectionId: item.connection_id,
      resourceKind: item.resource_kind,
      resourceId: item.resource_id,
      notionWorkspaceId: item.notion_workspace_id,
      observedAt: item.observed_at,
      sourceUpdatedAt: item.source_updated_at ?? null,
      // Explicitly NOT a grant; consumers MUST live-revalidate before access.
      providerAccessVerifiedNow: false,
    })];
  }));
}
