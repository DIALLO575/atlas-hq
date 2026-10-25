import test from "node:test";
import assert from "node:assert/strict";
import { createEngineContextRepository, createEngineContextResolver } from "../packages/engine-core/src/context-resolver.mjs";
const id = n => `${n.repeat(8)}-${n.repeat(4)}-4${n.repeat(3)}-8${n.repeat(3)}-${n.repeat(12)}`;
const W = id("a"), I = id("b"), R = id("c"), A = id("1"), S = id("2"), M = id("d");
const time = 1000000;
const scope = () => ({ workspaceId: W, instanceId: I, runId: R, atlasAgentKey: "vision",
  resources: [{ provider: "github", connectionId: id("3"), resourceId: "pr_42_9", sourceVersion: "a".repeat(40), operation: "pull_requests.read" }] });
function fixture() {
  const state = { row: { workspace_id: W, instance_id: I, run_id: R, mission_id: M, requested_by: A,
    primitive_id: "conversations.messages.send", payload_sha256: "a".repeat(64), run_state: "draft",
    instance_version: 1, connection_state: "offline", atlas_agent_key: "vision", remote_agent_key: "registered-remote-7", role: "owner" }, reads: 0, grants: 0 };
  const deps = { now: () => time,
    authenticate: async () => ({ verified: true, actorId: A, sessionId: S, expiresAt: time + 60000 }),
    repository: { readSnapshot: async () => { state.reads++; return structuredClone(state.row); } },
    authorize: async ({ contextDigest, context }) => {
      state.grants++; assert.equal(Object.isFrozen(context), true);
      return { allowed: true, contextDigest, checkedAt: time, expiresAt: time + 1000 };
    } };
  return { state, deps, input: { session: "opaque-fixture-session", scope: scope() } };
}
test("context preflight uses persisted intent, projects metadata only, never authorizes enqueue/dispatch", async () => {
  const f = fixture(); f.state.row.token = "private-data-must-not-escape";
  const result = await createEngineContextResolver(f.deps).inspect(f.input);
  assert.equal(f.state.reads, 2); assert.equal(f.state.grants, 1);
  assert.equal(result.primitiveId, "conversations.messages.send");
  assert.equal(result.canDispatch, false); assert.equal(result.canEnqueue, false);
  assert.equal(result.requiresRevalidationBeforeExecution, true);
  assert.match(result.contextDigest, /^[a-f0-9]{64}$/);
  assert.equal(Object.isFrozen(result.resources[0]), true);
  for (const text of ["private-data-must-not-escape", "registered-remote-7", S, "opaque-fixture-session"])
    assert.equal(JSON.stringify(result).includes(text), false);
});
test("client cannot supply identity, primitive, remote binding, approval, prompt, URL or grant evidence", async () => {
  for (const key of ["actorId", "sessionId", "primitiveId", "remoteAgentKey", "approved", "token", "prompt", "baseUrl", "evidence"]) {
    const f = fixture(); f.input.scope[key] = "forged";
    await assert.rejects(createEngineContextResolver(f.deps).inspect(f.input), /ENGINE_CONTEXT_INPUT_INVALID/);
    assert.equal(f.state.reads, 0); assert.equal(f.state.grants, 0);
  }
  const f = fixture(); f.input.actorId = A;
  await assert.rejects(createEngineContextResolver(f.deps).inspect(f.input), /ENGINE_CONTEXT_INPUT_INVALID/);
});
test("missing, cross-tenant, unbound, terminal and unsupported contexts fail before resource access", async () => {
  for (const patch of [null, {workspace_id: id("f")}, {instance_id: id("f")}, {run_id: id("f")},
    {requested_by: id("f")}, {mission_id: "forged"}, {atlas_agent_key: "other"}, {remote_agent_key: null},
    {role: "member"}, {run_state: "completed"}, {connection_state: "suspended"}, {instance_version: 0},
    {primitive_id: "channels.messages.send"}, {primitive_id: "computer.local.run"}]) {
    const f = fixture(); f.state.row = patch === null ? null : {...f.state.row, ...patch};
    await assert.rejects(createEngineContextResolver(f.deps).inspect(f.input), /ENGINE_CONTEXT_UNAVAILABLE/);
    assert.equal(f.state.grants, 0);
  }
});
test("each call reauthenticates and rereads; no cached context survives revocation", async () => {
  const f = fixture(); const resolver = createEngineContextResolver(f.deps);
  await resolver.inspect(f.input); f.state.row = null;
  await assert.rejects(resolver.inspect(f.input), /ENGINE_CONTEXT_UNAVAILABLE/);
  assert.equal(f.state.reads, 3); assert.equal(f.state.grants, 1);
});
test("even an empty external resource set still requires the mission/agent/tool authorizer", async () => {
  const f = fixture(); f.input.scope.resources = [];
  f.deps.authorize = async () => { f.state.grants++; return {allowed:false}; };
  await assert.rejects(createEngineContextResolver(f.deps).inspect(f.input), /ENGINE_CONTEXT_RESOURCE_FORBIDDEN/);
  assert.equal(f.state.grants, 1);
  f.input.session = null;
  await assert.rejects(createEngineContextResolver(f.deps).inspect(f.input), /ENGINE_CONTEXT_AUTH_REQUIRED/);
});
test("revocation and intent/binding changes while resources are checked invalidate preflight", async () => {
  for (const patch of [null, {remote_agent_key: "new-agent"}, {instance_version: 2}, {role: "admin"},
    {mission_id: id("e")}, {payload_sha256: "b".repeat(64)}, {run_state: "authorized"}]) {
    const f = fixture(); const authorize = f.deps.authorize;
    f.deps.authorize = async x => { f.state.row = patch === null ? null : {...f.state.row, ...patch}; return authorize(x); };
    await assert.rejects(createEngineContextResolver(f.deps).inspect(f.input), /ENGINE_CONTEXT_(UNAVAILABLE|CHANGED)/);
  }
});
test("proof must cover exact context and be fresh, unexpired, bounded, and explicitly allowed", async () => {
  for (const patch of [{allowed: false}, {contextDigest: "a".repeat(64)}, {checkedAt: time - 1},
    {checkedAt: time + 1}, {expiresAt: time}, {expiresAt: time + 15001}, {checkedAt: NaN}]) {
    const f = fixture(); const authorize = f.deps.authorize;
    f.deps.authorize = async x => ({...await authorize(x), ...patch});
    await assert.rejects(createEngineContextResolver(f.deps).inspect(f.input), /ENGINE_CONTEXT_RESOURCE_FORBIDDEN/);
  }
  const f = fixture(); delete f.deps.authorize;
  assert.throws(() => createEngineContextResolver(f.deps), /ENGINE_CONTEXT_DEPENDENCIES_INVALID/);
});
test("resource versions, connection, operation and identity change the proof digest", async () => {
  const seen = new Set();
  for (const patch of [{}, {sourceVersion: "b".repeat(40)}, {connectionId: id("4")},
    {resourceId: "pr_42_10"}, {operation: "pull_requests.files.read"}]) {
    const f = fixture(); Object.assign(f.input.scope.resources[0], patch);
    seen.add((await createEngineContextResolver(f.deps).inspect(f.input)).contextDigest);
  }
  assert.equal(seen.size, 5);
});
test("reject resource overflow, duplicate identities, unsupported operations, raw URLs and hidden data", async () => {
  for (const resources of [Array(13).fill(scope().resources[0]), Array(2).fill(scope().resources[0]),
    [{...scope().resources[0], operation: "pull_requests.merge"}],
    [{...scope().resources[0], provider: "unknown"}],
    [{...scope().resources[0], resourceId: "https://example.test/a"}],
    [{...scope().resources[0], resourceId: "a/../other"}],
    [{...scope().resources[0], sourceVersion: ""}],
    [{...scope().resources[0], content: "external prompt"}]]) {
    const f = fixture(); f.input.scope.resources = resources;
    await assert.rejects(createEngineContextResolver(f.deps).inspect(f.input), /ENGINE_CONTEXT_/);
    assert.equal(f.state.grants, 0);
  }
});
test("JWT expiry, clock regression, slow evidence and private adapter errors fail closed", async () => {
  for (const clock of [time - 1, time + 15001, NaN]) {
    const f = fixture(); let calls = 0; f.deps.now = () => ++calls === 1 ? time : clock;
    await assert.rejects(createEngineContextResolver(f.deps).inspect(f.input), /ENGINE_CONTEXT_EXPIRED/);
  }
  for (const identity of [null, {verified: false}, {verified:true,actorId:A,sessionId:S,expiresAt:time}]) {
    const f = fixture(); f.deps.authenticate = async () => identity;
    await assert.rejects(createEngineContextResolver(f.deps).inspect(f.input), /ENGINE_CONTEXT_AUTH_REQUIRED/);
  }
  for (const part of ["authenticate", "authorize", "repository"]) {
    const f = fixture(); const broken = async () => { throw Error("private credential sql auth details"); };
    if (part === "repository") f.deps.repository.readSnapshot = broken; else f.deps[part] = broken;
    await assert.rejects(createEngineContextResolver(f.deps).inspect(f.input), error => error.message === "ENGINE_CONTEXT_UNAVAILABLE");
  }
});
test("repository binds identifiers as values; single SQL snapshot never includes raw resources or tokens", async () => {
  let query;
  const repo = createEngineContextRepository({query: async (text, values) => {query = {text, values}; return {rows: []};}});
  assert.equal(await repo.readSnapshot({scope: scope(), auth: {actorId:A,sessionId:S}}), null);
  assert.deepEqual(query.values, [W,I,R,A,S,"vision"]);
  assert.equal(query.text.includes(W), false);
  assert.equal(query.text.includes("auth.sessions"), true);
  assert.equal(query.text.includes("private.atlas_engine_agent_bindings"), true);
  assert.equal(query.text.includes("credentials"), false);
  const bad = createEngineContextRepository({query: async () => ({rows:[{},{}]})});
  await assert.rejects(bad.readSnapshot({scope:scope(),auth:{actorId:A,sessionId:S}}), /ENGINE_CONTEXT_STORAGE_UNAVAILABLE/);
});
