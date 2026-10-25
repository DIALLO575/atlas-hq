import { createHash } from "node:crypto";

// Server preflight only. Never a reusable authorization or execution receipt.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const KEY = /^[A-Za-z0-9_-]{1,96}$/;
const REMOTE = /^[A-Za-z0-9_-]{1,120}$/;
const SHA = /^[a-f0-9]{64}$/;
const primitives = new Set(["conversations.messages.list", "conversations.messages.send"]);
const object = v => v !== null && typeof v === "object" && !Array.isArray(v);
const uuid = v => typeof v === "string" && UUID.test(v);
export class EngineContextError extends Error {
  constructor(code) { super(code); this.name = "EngineContextError"; this.code = code; }
}
const fail = code => { throw new EngineContextError(code); };
function exact(value, fields) {
  if (!object(value) || Object.keys(value).length !== fields.length ||
      fields.some(key => !Object.hasOwn(value, key))) fail("ENGINE_CONTEXT_INPUT_INVALID");
}
function selection(input) {
  exact(input, ["workspaceId", "instanceId", "runId", "atlasAgentKey", "resources"]);
  if (![input.workspaceId, input.instanceId, input.runId].every(uuid) ||
      typeof input.atlasAgentKey !== "string" || !KEY.test(input.atlasAgentKey) ||
      !Array.isArray(input.resources) || input.resources.length > 12) fail("ENGINE_CONTEXT_INPUT_INVALID");
  const unique = new Set();
  const resources = input.resources.map(ref => {
    exact(ref, ["provider", "connectionId", "resourceId", "sourceVersion", "operation"]);
    const operations = ref.provider === "github" ? ["pull_requests.read", "pull_requests.files.read"] :
      ref.provider === "notion" ? ["pages.read"] : [];
    if (!operations.includes(ref.operation) || !uuid(ref.connectionId) ||
        typeof ref.resourceId !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,199}$/.test(ref.resourceId) ||
        typeof ref.sourceVersion !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(ref.sourceVersion))
      fail("ENGINE_CONTEXT_RESOURCE_INVALID");
    const value = Object.freeze({ provider: ref.provider, connectionId: ref.connectionId.toLowerCase(),
      resourceId: ref.resourceId, sourceVersion: ref.sourceVersion, operation: ref.operation });
    const key = JSON.stringify([value.provider, value.connectionId, value.resourceId, value.operation]);
    if (unique.has(key)) fail("ENGINE_CONTEXT_RESOURCE_DUPLICATE");
    unique.add(key); return value;
  });
  return Object.freeze({ workspaceId: input.workspaceId.toLowerCase(), instanceId: input.instanceId.toLowerCase(),
    runId: input.runId.toLowerCase(), atlasAgentKey: input.atlasAgentKey,
    resources: Object.freeze(resources) });
}

/** One statement = one database snapshot. Supply a dedicated private SQL reader,
 * not a Data API client. No DDL, grants, credentials, payload or network calls.
 * query must use fresh autocommit/READ COMMITTED statements, never a cached or
 * REPEATABLE READ snapshot across the external authorization callback.
 */
export function createEngineContextRepository({ query } = {}) {
  if (typeof query !== "function") fail("ENGINE_CONTEXT_DEPENDENCIES_INVALID");
  return Object.freeze({ async readSnapshot({ scope, auth }) {
    const { rows } = await query(`select r.workspace_id,r.instance_id,r.id as run_id,r.mission_id,
      r.requested_by,r.primitive_id,r.payload_sha256,r.state as run_state,
      i.version as instance_version,i.connection_state,b.atlas_agent_key,b.remote_agent_key,wm.role,
      ma.id as mission_agent_binding_id,ma.version as mission_agent_binding_version,
      mg.id as mission_agent_primitive_grant_id
      from public.atlas_engine_runs r
      join public.atlas_engine_instances i on i.workspace_id=r.workspace_id and i.id=r.instance_id
      join public.atlas_missions m on m.workspace_id=r.workspace_id and m.id=r.mission_id
      join public.workspace_members wm on wm.workspace_id=r.workspace_id and wm.user_id=r.requested_by
      join auth.sessions s on s.user_id=r.requested_by and s.id=$5::uuid
      join private.atlas_engine_agent_bindings b on b.workspace_id=r.workspace_id
        and b.instance_id=r.instance_id and b.atlas_agent_key=$6::text
      join private.atlas_engine_mission_agents ma on ma.workspace_id=r.workspace_id
        and ma.mission_id=r.mission_id and ma.instance_id=r.instance_id
        and ma.atlas_agent_key=b.atlas_agent_key and ma.remote_agent_key=b.remote_agent_key and ma.revoked_at is null
      join private.atlas_engine_mission_agent_primitives mg on mg.mission_agent_id=ma.id
        and mg.primitive_id=r.primitive_id and mg.revoked_at is null
      where r.workspace_id=$1::uuid and r.instance_id=$2::uuid and r.id=$3::uuid
        and current_setting('transaction_isolation')='read committed'
        and r.requested_by=$4::uuid and wm.role in ('owner','admin')
        and (s.not_after is null or s.not_after>statement_timestamp())
        and m.status in ('planned','active') and i.engine_key='mausbot'
        and i.connection_state in ('offline','read-only','connected')
        and r.state in ('draft','awaiting-approval','authorized') and b.remote_agent_key is not null`,
    [scope.workspaceId, scope.instanceId, scope.runId, auth.actorId, auth.sessionId, scope.atlasAgentKey]);
    if (!Array.isArray(rows) || rows.length > 1) fail("ENGINE_CONTEXT_STORAGE_UNAVAILABLE");
    return rows[0] ?? null;
  } });
}
function snapshot(row, scope, auth) {
  if (!object(row) || row.workspace_id !== scope.workspaceId || row.instance_id !== scope.instanceId ||
      row.run_id !== scope.runId || row.requested_by !== auth.actorId || !uuid(row.mission_id) ||
      row.atlas_agent_key !== scope.atlasAgentKey || typeof row.remote_agent_key !== "string" || !REMOTE.test(row.remote_agent_key) ||
      !uuid(row.mission_agent_binding_id) || !uuid(row.mission_agent_primitive_grant_id) ||
      row.mission_agent_binding_version !== 1 ||
      !primitives.has(row.primitive_id) || typeof row.payload_sha256 !== "string" || !SHA.test(row.payload_sha256) ||
      !["owner", "admin"].includes(row.role) || !["draft", "awaiting-approval", "authorized"].includes(row.run_state) ||
      !["offline", "read-only", "connected"].includes(row.connection_state) ||
      !Number.isSafeInteger(row.instance_version) || row.instance_version < 1) fail("ENGINE_CONTEXT_UNAVAILABLE");
  return Object.freeze({ workspaceId: row.workspace_id, instanceId: row.instance_id, runId: row.run_id,
    missionId: row.mission_id, actorId: auth.actorId, sessionId: auth.sessionId,
    atlasAgentKey: row.atlas_agent_key, remoteAgentKey: row.remote_agent_key,
    missionAgentBindingId: row.mission_agent_binding_id, missionAgentBindingVersion: row.mission_agent_binding_version,
    missionAgentPrimitiveGrantId: row.mission_agent_primitive_grant_id,
    primitiveId: row.primitive_id, payloadSha256: row.payload_sha256, runState: row.run_state,
    role: row.role, instanceVersion: row.instance_version, connectionState: row.connection_state,
    resources: scope.resources });
}
const digest = value => createHash("sha256").update("atlas-engine-context-preflight-v1\n" + JSON.stringify(value)).digest("hex");

/** authenticate and authorize are trusted server adapters, NEVER request data.
 * authorize must re-read the mission/agent assignment, current agent/tool grant AND provider resource
 * ownership, actor access, revocation and exact sourceVersion for every ref.
 * There is no default allow, even when resources is empty. No adapters are wired
 * into the live application by this module. External content is not returned.
 */
export function createEngineContextResolver({ authenticate, repository, authorize, now = Date.now } = {}) {
  if (typeof authenticate !== "function" || typeof repository?.readSnapshot !== "function" ||
      typeof authorize !== "function" || typeof now !== "function") fail("ENGINE_CONTEXT_DEPENDENCIES_INVALID");
  return Object.freeze({ async inspect(input) {
    exact(input, ["session", "scope"]);
    const scope = selection(input.scope);
    if (input.session === null || input.session === undefined) fail("ENGINE_CONTEXT_AUTH_REQUIRED");
    try {
      const started = now();
      if (!Number.isSafeInteger(started) || started < 0) fail("ENGINE_CONTEXT_CLOCK_INVALID");
      const auth = await authenticate(input.session);
      if (!object(auth) || auth.verified !== true || !uuid(auth.actorId) || !uuid(auth.sessionId) ||
          !Number.isSafeInteger(auth.expiresAt) || auth.expiresAt <= started) fail("ENGINE_CONTEXT_AUTH_REQUIRED");
      const identity = Object.freeze({ actorId: auth.actorId.toLowerCase(), sessionId: auth.sessionId.toLowerCase() });
      const first = snapshot(await repository.readSnapshot({ scope, auth: identity }), scope, identity);
      const contextDigest = digest(first);
      const evidence = await authorize(Object.freeze({ context: first, contextDigest }));
      const second = snapshot(await repository.readSnapshot({ scope, auth: identity }), scope, identity);
      const finished = now();
      if (!Number.isSafeInteger(finished) || finished < started || finished - started > 15000 || auth.expiresAt <= finished)
        fail("ENGINE_CONTEXT_EXPIRED");
      if (digest(second) !== contextDigest) fail("ENGINE_CONTEXT_CHANGED");
      if (!object(evidence) || evidence.allowed !== true || evidence.contextDigest !== contextDigest ||
          !Number.isSafeInteger(evidence.checkedAt) || evidence.checkedAt < started || evidence.checkedAt > finished ||
          !Number.isSafeInteger(evidence.expiresAt) || evidence.expiresAt <= finished ||
          evidence.expiresAt - evidence.checkedAt > 15000) fail("ENGINE_CONTEXT_RESOURCE_FORBIDDEN");
      return Object.freeze({ kind: "engine-context-preflight", workspaceId: scope.workspaceId,
        instanceId: scope.instanceId, runId: scope.runId, missionId: second.missionId,
        atlasAgentKey: scope.atlasAgentKey, primitiveId: second.primitiveId, resources: scope.resources,
        contextDigest, checkedAt: finished, canDispatch: false, canEnqueue: false,
        requiresRevalidationBeforeExecution: true });
    } catch (error) {
      if (error instanceof EngineContextError) throw error;
      fail("ENGINE_CONTEXT_UNAVAILABLE");
    }
  } });
}
