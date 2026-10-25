// Test-only process. Never use with a real database or any MAUSBOT transport.
import pg from "pg";
import { createEngineOutboxRepository, createEngineSimulationTransport, runEngineSimulationOnce } from "../../packages/engine-core/src/outbox-worker.mjs";
if (process.env.ATLAS_ENGINE_DISPOSABLE_TEST !== "1" || !["127.0.0.1", "localhost"].includes(process.env.PGHOST)) throw Error("DISPOSABLE_ONLY");
const [workspaceId, worker, mode = "normal"] = process.argv.slice(2);
const client = new pg.Client({ connectionTimeoutMillis: 3000, statement_timeout: 5000 });
await client.connect();
const hold = event => new Promise(resolve => {
  process.once("message", resolve);
  process.send({ event });
});
try {
  const initial = await client.query("select to_regclass('private.atlas_engine_disposable_worker_fixture') is not null as ok");
  if (!initial.rows[0].ok) throw Error("DISPOSABLE_FIXTURE_REQUIRED");
  await client.query("set role service_role");
  let firstClaim = true;
  const query = async (text, values) => {
    if (text.includes("worker_claim") && firstClaim) {
      firstClaim = false;
      if (mode === "hold-claim") {
        await client.query("begin");
        const result = await client.query(text, values);
        await hold("claim-locked");
        await client.query("commit");
        return result;
      }
    }
    return client.query(text, values);
  };
  const repository = createEngineOutboxRepository({ query, workspaceId, worker, leaseSeconds: 15 });
  let heartbeatCount = 0;
  const controlledRepository = {
    ...repository,
    async heartbeat(lease) {
      if (++heartbeatCount === 1 && mode === "before-effect") await hold("before-effect");
      return repository.heartbeat(lease);
    },
    async finish(lease, success) {
      if (mode === "after-effect") await hold("after-effect");
      return repository.finish(lease, success);
    },
  };
  const transport = createEngineSimulationTransport({
    retryable: mode === "retryable",
    recordReceipt: async operation => {
      const result = await client.query(`insert into private.atlas_engine_disposable_worker_fixture(workspace_id,instance_id,operation_id)
        values($1::uuid,$2::uuid,$3::uuid) on conflict(workspace_id,instance_id,operation_id) do nothing returning operation_id`,
      [operation.workspaceId, operation.instanceId, operation.idempotencyKey]);
      return result.rowCount === 1 ? "recorded" : "duplicate";
    },
  });
  const result = await runEngineSimulationOnce({ repository: controlledRepository, transport });
  process.send({ event: "result", result });
} catch {
  process.send({ event: "failed" }); process.exitCode = 1;
} finally {
  await client.end();
  process.disconnect();
}
