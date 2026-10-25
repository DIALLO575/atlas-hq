import test from "node:test";
import assert from "node:assert/strict";
import { createEngineOutboxRepository, createEngineSimulationTransport, runEngineSimulationOnce } from "../packages/engine-core/src/outbox-worker.mjs";
const scope = { workspaceId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", instanceId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  outboxId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", runId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
  token: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee", epoch: "1" };
function fixture() {
  const calls = []; const effects = new Set();
  return { calls, effects,
    repository: { assertSimulation: async () => true, claim: async () => scope, heartbeat: async () => true,
      finish: async (_lease, success) => { calls.push(success); return success ? "delivered" : "retry"; } },
    transport: createEngineSimulationTransport({ recordReceipt: async op => {
      assert.equal(Object.hasOwn(op, "token"), false);
      const duplicate = effects.has(op.idempotencyKey); effects.add(op.idempotencyKey);
      return duplicate ? "duplicate" : "recorded";
    } }),
  };
}
test("simulation uses stable operation key through fencing generations and never returns lease details", async () => {
  const f = fixture();
  const result = await runEngineSimulationOnce(f);
  assert.deepEqual(result, { state: "delivered", simulationOnly: true, canDispatch: false });
  f.repository.claim = async () => ({ ...scope, epoch: "2", token: "ffffffff-ffff-4fff-8fff-ffffffffffff" });
  assert.equal((await runEngineSimulationOnce(f)).state, "delivered");
  assert.equal(f.effects.size, 1); assert.deepEqual(f.calls, [true, true]);
});
test("revocation/lost lease before or after effect never finishes", async () => {
  for (const before of [true, false]) {
    const f = fixture(); let count = 0;
    f.repository.heartbeat = async () => before ? false : ++count === 1;
    assert.equal((await runEngineSimulationOnce(f)).state, "lease-lost");
    assert.equal(f.effects.size, before ? 0 : 1); assert.equal(f.calls.length, 0);
  }
});
test("uncertain effect or finish errors leave recovery required and never leak upstream text", async () => {
  for (const failure of ["send", "finish"]) {
    const f = fixture();
    if (failure === "send") f.transport = createEngineSimulationTransport({ recordReceipt: async () => { throw Error("private-token sql details"); } });
    else f.repository.finish = async () => { throw Error("private-token sql details"); };
    const result = await runEngineSimulationOnce(f);
    assert.equal(result.state, "recovery-required");
    assert.equal(JSON.stringify(result).includes("private-token"), false);
  }
});
test("retryable simulation uses DB retry/dead-letter policy; unknown transports are refused", async () => {
  const f = fixture();
  f.transport = createEngineSimulationTransport({ recordReceipt: async () => "recorded", retryable: true });
  assert.equal((await runEngineSimulationOnce(f)).state, "retry");
  assert.deepEqual(f.calls, [false]); assert.equal(f.effects.size, 0);
  await assert.rejects(runEngineSimulationOnce({ ...f, transport: { send: async () => "recorded" } }), /ENGINE_SIMULATION_REQUIRED/);
});
test("stop, idle, store outage and timeout fail closed", async () => {
  const f = fixture(); const abort = new AbortController(); abort.abort();
  assert.equal((await runEngineSimulationOnce({ ...f, signal: abort.signal })).state, "stopped");
  f.repository.assertSimulation = async () => false;
  assert.equal((await runEngineSimulationOnce(f)).state, "simulation-not-configured");
  f.repository.assertSimulation = async () => true;
  f.repository.claim = async () => null;
  assert.equal((await runEngineSimulationOnce(f)).state, "idle");
  f.repository.claim = async () => { throw Error("private SQL"); };
  assert.equal((await runEngineSimulationOnce(f)).state, "store-unavailable");
  f.repository.claim = async () => scope;
  f.transport = createEngineSimulationTransport({ recordReceipt: () => new Promise(() => {}) });
  assert.equal((await runEngineSimulationOnce({ ...f, timeoutMs: 10 })).state, "recovery-required");
  assert.equal(f.calls.length, 0);
});
test("SQL adapter parameterizes scope and fencing, projects metadata only and scrubs DB errors", async () => {
  const calls = [];
  const repo = createEngineOutboxRepository({ workspaceId: scope.workspaceId, worker: "worker-test",
    query: async (text, values) => { calls.push({ text, values });
      return { rows: [{ outbox_id: scope.outboxId, instance_id: scope.instanceId, run_id: scope.runId,
        lease_token: scope.token, lease_epoch: "1", payload_ciphertext: "never-return" }] }; } });
  const lease = await repo.claim();
  assert.equal(JSON.stringify(lease).includes("never-return"), false);
  assert.equal(calls[0].text.includes(scope.workspaceId), false);
  assert.deepEqual(calls[0].values, [scope.workspaceId, "worker-test", 30]);
  await assert.rejects(repo.heartbeat({ ...lease, workspaceId: scope.instanceId }), /ENGINE_WORKER_LEASE_INVALID/);
  const unavailable = createEngineOutboxRepository({ workspaceId: scope.workspaceId, worker: "worker-test",
    query: async () => { throw Error("password=private"); } });
  await assert.rejects(unavailable.claim(), error => error.message === "ENGINE_WORKER_STORE_UNAVAILABLE");
  assert.throws(() => createEngineOutboxRepository({ query: async () => {}, workspaceId: scope.workspaceId, worker: "bad worker" }), /ENGINE_WORKER_CONFIG_INVALID/);
});
