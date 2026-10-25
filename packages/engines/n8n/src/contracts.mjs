/**
 * n8n integration contract for ATLAS (SHA-172): OFFLINE ONLY.
 * This module does not connect to n8n, store credentials, grant permissions,
 * call tools, publish workflows, dispatch jobs, or authorize a runtime action.
 * The registered capability is a *proposal*, not evidence of availability.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const REMOTE_ID = /^[A-Za-z0-9_-]{1,128}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const isRecord = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

export class N8nContractError extends Error {
  constructor(code) {
    super(code);
    this.name = "N8nContractError";
    this.code = code;
    this.status = 400;
  }
}

const reject = (code) => { throw new N8nContractError(code); };

export const N8N_TRANSPORTS = Object.freeze(["rest", "mcp", "webhook"]);
export const N8N_MODES = Object.freeze(["read", "write", "execute"]);

/**
 * A unique capability ID selects exactly one primary transport; REST import
 * and MCP AI creation are intentionally different intentions. Nothing here
 * implies an endpoint or tool is enabled on a particular n8n installation.
 */
export const N8N_CAPABILITIES = Object.freeze([
  { id: "workflows.list", transport: "rest", mode: "read", scope: "instance" },
  { id: "workflows.get", transport: "rest", mode: "read", scope: "workflow" },
  { id: "executions.list", transport: "rest", mode: "read", scope: "workflow" },
  { id: "executions.get", transport: "rest", mode: "read", scope: "execution" },
  { id: "workflows.import", transport: "rest", mode: "write", scope: "instance" },
  { id: "workflows.ai.create", transport: "mcp", mode: "write", scope: "instance" },
  { id: "workflows.ai.validate", transport: "mcp", mode: "read", scope: "instance" },
  { id: "workflows.ai.update", transport: "mcp", mode: "write", scope: "workflow" },
  { id: "workflows.publish", transport: "mcp", mode: "write", scope: "workflow" },
  { id: "workflows.ai.test", transport: "mcp", mode: "execute", scope: "workflow" },
  { id: "workflows.invoke", transport: "webhook", mode: "execute", scope: "workflow" },
  { id: "workflows.invoke_as_tool", transport: "mcp", mode: "execute", scope: "workflow" },
  { id: "tools.discover", transport: "mcp", mode: "read", scope: "instance" },
].map((value) => Object.freeze({
  ...value,
  requiresHumanApproval: value.mode !== "read",
  available: false,
  callable: false,
})));

const DEFINITIONS = new Map(N8N_CAPABILITIES.map((capability) => [capability.id, capability]));

function exactShape(value, required, optional = []) {
  if (!isRecord(value)) reject("N8N_INPUT_INVALID");
  if (Object.keys(value).some((key) => ![...required, ...optional].includes(key))) {
    reject("N8N_FIELD_FORBIDDEN");
  }
  if (required.some((key) => !hasOwn(value, key))) reject("N8N_FIELD_MISSING");
}

/** Opaque remote IDs are not paths, URLs, or credentials. */
export function validateN8nRemoteId(value) {
  if (typeof value !== "string" || !REMOTE_ID.test(value)) reject("N8N_REMOTE_ID_INVALID");
  return value;
}

/**
 * Strict offline plan. The caller is never allowed to assert runtime access,
 * approval, permission, enabled state, a remote URL, or an API credential.
 * The BFF and durable worker must recheck their own authoritative state.
 */
export function planN8nCapability(input) {
  exactShape(input, ["workspaceId", "instanceId", "capability"],
    ["workflowId", "executionId", "intentDigest", "transport"]);
  if (typeof input.workspaceId !== "string" || !UUID.test(input.workspaceId) ||
      typeof input.instanceId !== "string" || !UUID.test(input.instanceId)) {
    reject("N8N_SCOPE_INVALID");
  }
  const capability = DEFINITIONS.get(input.capability);
  if (!capability) reject("N8N_CAPABILITY_UNKNOWN");
  if (input.transport !== undefined && input.transport !== capability.transport) {
    reject("N8N_TRANSPORT_MISMATCH");
  }
  if (capability.scope === "instance") {
    if (hasOwn(input, "workflowId") || hasOwn(input, "executionId")) reject("N8N_SCOPE_UNEXPECTED");
  } else {
    validateN8nRemoteId(input.workflowId);
    if (capability.scope === "execution") validateN8nRemoteId(input.executionId);
    else if (hasOwn(input, "executionId")) reject("N8N_SCOPE_UNEXPECTED");
  }
  if (capability.mode === "read") {
    if (hasOwn(input, "intentDigest")) reject("N8N_INTENT_UNEXPECTED");
  } else if (typeof input.intentDigest !== "string" || !DIGEST.test(input.intentDigest)) {
    reject("N8N_INTENT_DIGEST_REQUIRED");
  }
  return Object.freeze({
    provider: "n8n",
    workspaceId: input.workspaceId,
    instanceId: input.instanceId,
    capability: capability.id,
    transport: capability.transport,
    mode: capability.mode,
    ...(capability.scope === "instance" ? {} : { workflowId: input.workflowId }),
    ...(capability.scope === "execution" ? { executionId: input.executionId } : {}),
    ...(capability.mode === "read" ? {} : { intentDigest: input.intentDigest }),
    requiresHumanApproval: capability.requiresHumanApproval,
    requiresVerifiedActor: true,
    requiresWorkspaceGrant: true,
    requiresTrustedInstanceBinding: true,
    requiresRuntimeCapabilityVerification: true,
    available: false,
    canDispatch: false,
    canEnqueue: false,
  });
}

/**
 * Distinguishes provider-advertised tool names from ATLAS permissions.
 * Discovery is not an authorization decision and never activates a tool.
 */
export function summarizeN8nDiscovery(input) {
  exactShape(input, ["transport", "reportedCapabilities"]);
  if (!N8N_TRANSPORTS.includes(input.transport)) reject("N8N_TRANSPORT_UNKNOWN");
  const values = input.reportedCapabilities;
  if (!Array.isArray(values) || values.length > 100 ||
      values.some((value) => typeof value !== "string" || value.length > 120)) {
    reject("N8N_DISCOVERY_INVALID");
  }
  const reported = new Set(values);
  return Object.freeze(N8N_CAPABILITIES.filter((definition) => definition.transport === input.transport)
    .map((definition) => Object.freeze({
      capability: definition.id,
      transport: definition.transport,
      advertised: reported.has(definition.id),
      available: false,
      callable: false,
      authorizationVerified: false,
    })));
}
