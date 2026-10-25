/**
 * SHA-176: ATLAS n8n authoritative PRE-FLIGHT contract. OFFLINE ONLY.
 *
 * This is NOT a release/dispatch permit or a standalone HTTP authorization
 * endpoint. Inputs from a browser cannot claim actor, role, approval, grants,
 * transport, instance host, or provider credentials.
 *
 * Repository functions must be provided by a separately reviewed privileged
 * DB adapter with current auth.sessions + workspace membership + n8n instance,
 * workflow ownership, provider grant and consistent transaction snapshot.
 * No such live adapter is wired in this PR.
 *
 * The actual mission-bound Engine outbox and approvals must be reused when a
 * compatible run model exists. Never insert autonomous n8n executions into
 * atlas_engine_runs by manufacturing a mission.
 */
import { N8N_CAPABILITIES, planN8nCapability, validateN8nRemoteId } from "./contracts.mjs";
import { n8nReleasePermission } from "../../../engine-core/src/release-gates.mjs";

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const SHA = /^[a-f0-9]{64}$/;
const record = x => x !== null && typeof x === "object" && !Array.isArray(x);
const validUUID = x => typeof x === "string" && UUID.test(x);
const CAPABILITIES = new Map(N8N_CAPABILITIES.map(item => [item.id, item]));
export class N8nPreflightError extends Error {
  constructor(code) {
    super(code);
    this.name = "N8nPreflightError";
    this.code = code;
    this.status = 403;
  }
}
const fail = code => { throw new N8nPreflightError(code); };
function exact(value, required, optional = []) {
  if (!record(value) || required.some(k => !Object.hasOwn(value, k)) ||
      Object.keys(value).some(k => ![...required, ...optional].includes(k)))
    fail("N8N_PREFLIGHT_INPUT_INVALID");
}
function actor(value) {
  if (!record(value) || value.verified !== true ||
      !validUUID(value.actorId) || !validUUID(value.sessionId)) {
    fail("N8N_PREFLIGHT_AUTH_REQUIRED");
  }
  return { actorId: value.actorId.toLowerCase(), sessionId: value.sessionId.toLowerCase() };
}
function txMethods(tx) {
  for (const key of ["sessionActive", "workspaceRole", "getInstanceForScope",
    "getWorkflowForScope", "capabilityGrant"]) {
    if (!record(tx) || typeof tx[key] !== "function") fail("N8N_PREFLIGHT_STORAGE_UNAVAILABLE");
  }
}
function normalize(input) {
  exact(input, ["scope", "capability", "session"],
    ["intentDigest", "idempotencyKey", "executionId"]);
  const capability = CAPABILITIES.get(input.capability);
  if (!capability) fail("N8N_PREFLIGHT_CAPABILITY_INVALID");
  exact(input.scope, ["workspaceId", "instanceId"], ["workflowId"]);
  const { workspaceId, instanceId, workflowId } = input.scope;
  if (!validUUID(workspaceId) || !validUUID(instanceId)) fail("N8N_PREFLIGHT_SCOPE_INVALID");
  if (capability.scope === "instance") {
    if (workflowId !== undefined || input.executionId !== undefined)
      fail("N8N_PREFLIGHT_SCOPE_INVALID");
  } else if (!validUUID(workflowId)) fail("N8N_PREFLIGHT_SCOPE_INVALID");
  if (capability.scope === "execution") {
    try { validateN8nRemoteId(input.executionId); }
    catch { fail("N8N_PREFLIGHT_EXECUTION_INVALID"); }
  } else if (input.executionId !== undefined) fail("N8N_PREFLIGHT_SCOPE_INVALID");

  if (capability.mode === "read") {
    if (input.intentDigest !== undefined || input.idempotencyKey !== undefined)
      fail("N8N_PREFLIGHT_INTENT_UNEXPECTED");
  } else if (!SHA.test(input.intentDigest ?? "") ||
      !validUUID(input.idempotencyKey)) fail("N8N_PREFLIGHT_INTENT_REQUIRED");
  if (input.session === null || input.session === undefined)
    fail("N8N_PREFLIGHT_AUTH_REQUIRED");
  return { workspaceId: workspaceId.toLowerCase(), instanceId: instanceId.toLowerCase(),
    workflowId: workflowId?.toLowerCase(), capability,
    intentDigest: input.intentDigest, idempotencyKey: input.idempotencyKey,
    executionId: input.executionId, session: input.session };
}
function instanceRow(row, scope) {
  if (!record(row) || row.workspace_id !== scope.workspaceId ||
      row.id !== scope.instanceId || row.engine_key !== "n8n" ||
      row.connection_state !== "offline" ||
      !Number.isSafeInteger(row.version) || row.version < 1)
    fail("N8N_PREFLIGHT_INSTANCE_UNAVAILABLE");
  return row;
}
function workflowRow(row, scope, cap) {
  if (!record(row) || row.workspace_id !== scope.workspaceId ||
      row.instance_id !== scope.instanceId || row.id !== scope.workflowId)
    fail("N8N_PREFLIGHT_WORKFLOW_FORBIDDEN");
  try { validateN8nRemoteId(row.remote_workflow_id); }
  catch { fail("N8N_PREFLIGHT_WORKFLOW_FORBIDDEN"); }
  if (!["observed", "unverified", "missing"].includes(row.sync_state))
    fail("N8N_PREFLIGHT_WORKFLOW_FORBIDDEN");
  if (cap.mode !== "read" && (row.sync_state !== "observed" ||
      row.remote_active !== true)) fail("N8N_PREFLIGHT_WORKFLOW_NOT_VERIFIED");
  return row;
}

/**
 * Returns a frozen NON-EXECUTABLE diagnostic only. Passing preflight means
 * the *injected fake/trusted adapter* checked a current identity and grant;
 * it never represents human approval, persisted idempotency, egress approval
 * or a durable outbox job. Always false even when every callback returns true.
 */
export function createN8nRuntimePreflight({ authenticate, repository } = {}) {
  if (typeof authenticate !== "function" || !record(repository) ||
      typeof repository.transaction !== "function")
    fail("N8N_PREFLIGHT_DEPENDENCIES_INVALID");

  return Object.freeze({
    async inspect(input) {
      const request = normalize(input);
      let verified;
      try { verified = actor(await authenticate(request.session)); }
      catch { fail("N8N_PREFLIGHT_AUTH_REQUIRED"); }
      try {
        return await repository.transaction(async tx => {
          txMethods(tx);
          if (await tx.sessionActive(verified.actorId, verified.sessionId) !== true)
            fail("N8N_PREFLIGHT_SESSION_REVOKED");
          const role = await tx.workspaceRole(request.workspaceId, verified.actorId);
          if (!["owner", "admin", "member"].includes(role))
            fail("N8N_PREFLIGHT_WORKSPACE_FORBIDDEN");
          if (request.capability.mode !== "read" && !["owner", "admin"].includes(role))
            fail("N8N_PREFLIGHT_ADMIN_REQUIRED");
          instanceRow(await tx.getInstanceForScope(request.workspaceId, request.instanceId), request);
          const flow = request.workflowId === undefined ? null : workflowRow(
            await tx.getWorkflowForScope(request.workspaceId, request.instanceId, request.workflowId),
            request, request.capability,
          );
          const granted = await tx.capabilityGrant(Object.freeze({
            workspaceId: request.workspaceId, instanceId: request.instanceId,
            workflowId: request.workflowId ?? null, actorId: verified.actorId,
            capability: request.capability.id, mode: request.capability.mode,
          }));
          if (granted !== true) fail("N8N_PREFLIGHT_GRANT_FORBIDDEN");
          let capPlan;
          try {
            capPlan = planN8nCapability({
              workspaceId: request.workspaceId, instanceId: request.instanceId,
              capability: request.capability.id,
              ...(flow ? { workflowId: flow.remote_workflow_id } : {}),
              ...(request.capability.scope === "execution" ? { executionId: request.executionId } : {}),
              ...(request.capability.mode !== "read" ? { intentDigest: request.intentDigest } : {}),
            });
          } catch { fail("N8N_PREFLIGHT_CAPABILITY_INVALID"); }
          const release = n8nReleasePermission({}, request.capability.mode);
          if (release.allowed !== false || capPlan.canDispatch !== false ||
              capPlan.canEnqueue !== false) fail("N8N_PREFLIGHT_GATE_INVARIANT_FAILED");
          return Object.freeze({
            kind: "n8n-preflight-inspection", workspaceId: request.workspaceId,
            instanceId: request.instanceId, workflowId: request.workflowId ?? null,
            capability: request.capability.id, mode: request.capability.mode,
            transport: capPlan.transport, providerGrantChecked: true,
            requiresHumanApproval: request.capability.requiresHumanApproval,
            requiresDurableIdempotency: request.capability.mode !== "read",
            requiresEgressCertification: true,
            requiresReleaseMigration: true,
            requiresTrustedWorker: request.capability.mode !== "read",
            canEnqueue: false, canDispatch: false, providerIoEnabled: false,
            releaseCode: release.code,
          });
        });
      } catch (error) {
        if (error instanceof N8nPreflightError) throw error;
        fail("N8N_PREFLIGHT_STORAGE_UNAVAILABLE");
      }
    },
  });
}
