/**
 * ATLAS x Notion V2 — SHA-135.
 * Build-time implementation != configured integration != ATLAS authorization
 * != a successful provider operation. This manifest is policy metadata only.
 *
 * Call evaluateNotionCapabilities ONLY with server-derived bindings and
 * ephemeral evidence created from a successful provider request. Never accept
 * registry.capabilities, browser grants or OAuth scopes as a proof of access.
 */
export const NOTION_CAPABILITY_SCHEMA = "atlas.notion.capabilities.v1";
export const NOTION_REST_API_VERSION = "2026-03-11";
const UUID = /^(?:[0-9a-f]{32}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;
const MAX_PROOF_AGE_MS = 60_000;
const surfaces = new Set(["rest", "webhooks", "mcp", "agents", "workers", "admin"]);
const credentialBySurface = Object.freeze({
  rest: "notion_rest_oauth", webhooks: "notion_webhook_subscription",
  mcp: "notion_mcp_oauth", agents: "notion_agent_api",
  workers: "notion_worker", admin: "notion_admin_org_bot",
});

const definitions = [
  ["rest.search.title", "rest", "read", true, null, "POST /v1/search (titles only)"],
  ["rest.users.me", "rest", "read", true, null, "GET /v1/users/me"],
  ["rest.pages.retrieve", "rest", "read", true, null, "GET /v1/pages/{id}"],
  ["rest.blocks.retrieve", "rest", "read", true, null, "GET /v1/blocks/{id}"],
  ["rest.blocks.children", "rest", "read", true, null, "GET /v1/blocks/{id}/children"],
  ["rest.databases.retrieve", "rest", "read", true, null, "GET /v1/databases/{id}"],
  ["rest.data_sources.retrieve", "rest", "read", true, null, "GET /v1/data_sources/{id}"],
  ["rest.data_sources.query", "rest", "read", false, null, "POST /v1/data_sources/{id}/query"],
  ["rest.pages.properties", "rest", "read", false, null, "GET /v1/pages/{id}/properties/{property_id}"],
  ["rest.pages.markdown", "rest", "read", false, null, "enhanced Markdown retrieval"],
  ["rest.pages.create", "rest", "write", false, null, "POST /v1/pages"],
  ["rest.pages.update", "rest", "write", false, null, "PATCH /v1/pages/{id}"],
  ["rest.blocks.append", "rest", "write", false, null, "PATCH /v1/blocks/{id}/children"],
  ["rest.blocks.update", "rest", "write", false, null, "PATCH /v1/blocks/{id}"],
  ["rest.comments", "rest", "read", false, null, "Comments API"],
  ["rest.files", "rest", "read", false, null, "Files and upload APIs"],
  ["rest.views", "rest", "read", false, null, "Views API"],
  ["webhooks.events.receive", "webhooks", "receive", false, null, "Notion signed webhook"],
  ["webhooks.events.reconcile", "webhooks", "sync", false, null, "Durable inbox and REST replay"],
  ["mcp.tools.list", "mcp", "read", false, null, "MCP tools/list"],
  ["mcp.tools.call.read", "mcp", "read", false, null, "MCP read-only tools"],
  ["mcp.tools.call.write", "mcp", "write", false, null, "MCP writes with explicit approval"],
  ["agents.sessions", "agents", "execute", false, "business_or_enterprise", "Agent SDK/API (eligibility required)"],
  ["workers.sync", "workers", "sync", false, "provider_eligibility", "Notion-hosted Workers"],
  ["admin.organization", "admin", "admin", false, "enterprise", "Organization bot Admin API"],
];
export const NOTION_CAPABILITY_MANIFEST = Object.freeze(definitions.map(
  ([id, surface, operation, implemented, plan, description]) => Object.freeze({
    id, surface, credential: credentialBySurface[surface], operation,
    implemented, plan, description, apiVersion: surface === "rest" ? NOTION_REST_API_VERSION : null,
  }),
));
const readOnlyStatuses = new Set(["not_implemented", "built", "configured",
  "authorized", "provider_verified", "degraded"]);

function validBinding(value) {
  return value && typeof value === "object" &&
    UUID.test(value.workspaceId ?? "") && UUID.test(value.actorId ?? "") &&
    UUID.test(value.connectionId ?? "") && UUID.test(value.notionWorkspaceId ?? "") &&
    surfaces.has(value.surface) &&
    value.credential === credentialBySurface[value.surface] && value.active === true;
}
function matchesEvidence(evidence, binding, id, now) {
  return evidence && evidence.source === "notion_live_provider_response" &&
    evidence.operation === id && evidence.surface === binding.surface &&
    evidence.connectionId === binding.connectionId &&
    evidence.workspaceId === binding.workspaceId &&
    evidence.actorId === binding.actorId &&
    evidence.notionWorkspaceId === binding.notionWorkspaceId &&
    Number.isSafeInteger(evidence.checkedAt) && evidence.checkedAt <= now &&
    now - evidence.checkedAt <= MAX_PROOF_AGE_MS;
}

/**
 * Only the server route constructs connectionBinding after validating actual
 * Auth user, live membership, active vault row and the matching registry.
 * A successful bot probe proves only rest.users.me; a successful title search
 * proves only rest.search.title, NOT every page's read_content permission.
 *
 * planEligibility unknown => null; never infer Enterprise/Agents entitlement.
 */
export function evaluateNotionCapabilities({
  configuredSurfaces = {}, connectionBinding = null,
  providerEvidence = [], failedOperations = [], planEligibility = {},
  checkedAt = Date.now(),
} = {}) {
  if (!Number.isSafeInteger(checkedAt) || checkedAt < 0) throw new Error("INVALID_CHECKED_AT");
  const valid = Boolean(validBinding(connectionBinding));
  const result = NOTION_CAPABILITY_MANIFEST.map(cap => {
    const configured = configuredSurfaces[cap.surface] === true;
    const bound = valid && connectionBinding.surface === cap.surface &&
      configured && connectionBinding.credential === cap.credential;
    const verified = bound && Array.isArray(providerEvidence) &&
      providerEvidence.some(proof => matchesEvidence(proof, connectionBinding, cap.id, checkedAt));
    const failed = bound && Array.isArray(failedOperations) &&
      failedOperations.includes(cap.id) && !verified;
    const eligible = cap.plan === null ? null :
      Object.prototype.hasOwnProperty.call(planEligibility, cap.plan)
        ? planEligibility[cap.plan] === true : null;
    const status = !cap.implemented ? "not_implemented" : !configured ? "built" :
      !bound ? "configured" : verified ? "provider_verified" :
      failed ? "degraded" : "authorized";
    if (!readOnlyStatuses.has(status)) throw new Error("INVALID_CAPABILITY_STATE");
    return Object.freeze({
      id: cap.id, surface: cap.surface, credential: cap.credential,
      operation: cap.operation, apiVersion: cap.apiVersion,
      planEligible: eligible, status,
      available: cap.implemented && verified && (cap.plan === null || eligible === true),
      providerVerified: Boolean(verified), checkedAt: verified ? checkedAt : null,
      requiresApproval: cap.operation === "write" || cap.operation === "admin" ||
        cap.operation === "execute",
    });
  });
  return Object.freeze({
    schema: NOTION_CAPABILITY_SCHEMA, generatedAt: checkedAt,
    evidenceScope: "actor_workspace_connection_resource_operation",
    providerAuthenticationIsNotContentAuthorization: true,
    capabilities: result,
  });
}

export function notionCapabilityEvidence({
  operation, connectionBinding, checkedAt = Date.now(),
}) {
  if (!validBinding(connectionBinding) ||
      !NOTION_CAPABILITY_MANIFEST.some(cap =>
        cap.id === operation && cap.implemented && cap.surface === connectionBinding.surface) ||
      !Number.isSafeInteger(checkedAt)) throw new Error("INVALID_NOTION_EVIDENCE");
  return Object.freeze({
    source: "notion_live_provider_response", operation, surface: connectionBinding.surface,
    workspaceId: connectionBinding.workspaceId, actorId: connectionBinding.actorId,
    connectionId: connectionBinding.connectionId,
    notionWorkspaceId: connectionBinding.notionWorkspaceId, checkedAt,
  });
}
