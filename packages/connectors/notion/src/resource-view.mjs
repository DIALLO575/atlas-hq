/**
 * Whitelist the read-only information ATLAS deliberately returns to browsers.
 * Notion response objects can contain sensitive nested fields; don't proxy them.
 */
const UUID = /^(?:[0-9a-f]{32}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;
function richText(parts, maxLength = 600) {
  if (!Array.isArray(parts)) return "";
  return parts.slice(0, 30).map(item =>
    typeof item?.plain_text === "string" ? item.plain_text : ""
  ).join("").slice(0, maxLength);
}
function pageTitle(value) {
  const properties = value?.properties;
  const titled = properties && typeof properties === "object" &&
    Object.values(properties).find(p => p?.type === "title" && Array.isArray(p.title));
  return richText(value?.title || titled?.title, 180) || "Sans titre";
}
export function notionListView(raw) {
  if (!raw || !Array.isArray(raw.results) ||
      typeof raw.has_more !== "boolean" ||
      (raw.has_more && typeof raw.next_cursor !== "string")) {
    throw new Error("NOTION_INVALID_RESPONSE");
  }
  return {
    results: raw.results.slice(0, 100).flatMap(item => {
      if (!UUID.test(item?.id ?? "") || !["page", "database", "data_source"].includes(item.object)) return [];
      return [{
        id: item.id,
        kind: item.object,
        title: pageTitle(item),
        editedAt: typeof item.last_edited_time === "string" ? item.last_edited_time : null,
      }];
    }),
    hasMore: raw.has_more,
    nextCursor: raw.next_cursor ?? null,
  };
}
export function notionBlockView(raw) {
  if (!raw || !Array.isArray(raw.results) || typeof raw.has_more !== "boolean") {
    throw new Error("NOTION_INVALID_RESPONSE");
  }
  return {
    results: raw.results.slice(0, 50).flatMap(item => {
      if (!UUID.test(item?.id ?? "") || typeof item.type !== "string") return [];
      const body = item[item.type];
      return [{
        id: item.id, type: item.type,
        text: richText(body?.rich_text || body?.caption),
        hasChildren: item.has_children === true,
      }];
    }),
    hasMore: raw.has_more,
    nextCursor: raw.next_cursor ?? null,
  };
}
/** This guard supplements, not replaces, live session and membership checks. */
export function assertPersonalNotionConnection({ connection, registry, actor, connectionId }) {
  if (!connection || !registry || !actor || !UUID.test(connectionId ?? "") ||
      connection.connection_id !== connectionId || registry.id !== connectionId ||
      connection.workspace_id !== actor.workspaceId ||
      connection.user_id !== actor.userId ||
      registry.workspace_id !== actor.workspaceId ||
      registry.owner_id !== actor.userId ||
      registry.provider !== "notion" || registry.status !== "connected" ||
      connection.revoked_at !== null) {
    throw new Error("NOTION_CONNECTION_FORBIDDEN");
  }
  return true;
}
