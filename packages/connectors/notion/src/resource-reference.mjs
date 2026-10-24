/**
 * SHA-135 resource-scoped provenance, generated only after a successful
 * Notion provider GET with the matching, currently authorized personal bearer.
 * Pure validation cannot independently establish caller authentication.
 */
const UUID = /^(?:[0-9a-f]{32}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;
const TYPES = Object.freeze({
  page: "rest.pages.retrieve",
  block: "rest.blocks.retrieve",
  database: "rest.databases.retrieve",
  data_source: "rest.data_sources.retrieve",
});
const clean = value => typeof value === "string" && UUID.test(value);
const norm = value => value.toLowerCase().replaceAll("-", "");
const same = (a, b) => clean(a) && clean(b) && norm(a) === norm(b);

export function notionResourceOperation(kind) {
  if (!Object.hasOwn(TYPES, kind)) throw new Error("NOTION_RESOURCE_KIND_INVALID");
  return TYPES[kind];
}
export function notionResourceRef({
  kind, resourceId, connectionBinding, providerResponse, checkedAt = Date.now(),
}) {
  notionResourceOperation(kind);
  if (!clean(resourceId) || !connectionBinding || connectionBinding.surface !== "rest" ||
      connectionBinding.credential !== "notion_rest_oauth" ||
      connectionBinding.active !== true ||
      ![connectionBinding.workspaceId, connectionBinding.actorId,
        connectionBinding.connectionId, connectionBinding.notionWorkspaceId].every(clean) ||
      !providerResponse || providerResponse.object !== kind ||
      !same(resourceId, providerResponse.id) ||
      !Number.isSafeInteger(checkedAt) || checkedAt < 0) {
    throw new Error("NOTION_RESOURCE_PROOF_INVALID");
  }
  const edited = providerResponse.last_edited_time;
  // Never accept fabricated/unparseable provenance as an optimistic version.
  if (edited != null && (typeof edited !== "string" ||
      !/^\d{4}-\d{2}-\d{2}T/.test(edited) ||
      !Number.isFinite(Date.parse(edited)))) {
    throw new Error("NOTION_RESOURCE_VERSION_INVALID");
  }
  return Object.freeze({
    schema: "atlas.notion.resource-ref.v1",
    provider: "notion",
    apiVersion: "2026-03-11",
    surface: "rest", kind, resourceId: norm(resourceId),
    workspaceId: connectionBinding.workspaceId,
    actorId: connectionBinding.actorId,
    connectionId: connectionBinding.connectionId,
    notionWorkspaceId: connectionBinding.notionWorkspaceId,
    sourceVersion: edited ?? null,
    observedAt: checkedAt,
    provenance: "notion_live_provider_response",
  });
}
export function matchesNotionResourceRef(resourceRef, binding, kind, resourceId) {
  return Boolean(resourceRef && binding && resourceRef.schema === "atlas.notion.resource-ref.v1" &&
    resourceRef.provider === "notion" &&
    resourceRef.apiVersion === "2026-03-11" &&
    resourceRef.provenance === "notion_live_provider_response" &&
    resourceRef.kind === kind && Object.hasOwn(TYPES, kind) &&
    same(resourceRef.resourceId, resourceId) &&
    same(resourceRef.workspaceId, binding.workspaceId) &&
    same(resourceRef.actorId, binding.actorId) &&
    same(resourceRef.connectionId, binding.connectionId) &&
    same(resourceRef.notionWorkspaceId, binding.notionWorkspaceId) &&
    binding.surface === "rest" && binding.credential === "notion_rest_oauth" &&
    binding.active === true && Number.isSafeInteger(resourceRef.observedAt));
}
