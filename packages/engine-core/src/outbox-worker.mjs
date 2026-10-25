import { ATLAS_WORKSPACE_ID } from "./catalog.mjs";

const uuid = value => typeof value === "string" && ATLAS_WORKSPACE_ID.test(value);
const workerId = value => typeof value === "string" && /^[A-Za-z0-9._-]{1,80}$/.test(value);
export class EngineWorkerError extends Error {
  constructor(code = "ENGINE_WORKER_STORE_UNAVAILABLE") {
    super(code); this.name = "EngineWorkerError"; this.code = code;
  }
}
const fail = code => { throw new EngineWorkerError(code); };
function checkLease(lease) {
  if (!lease || !uuid(lease.outboxId) || !uuid(lease.instanceId) || !uuid(lease.runId) ||
      !uuid(lease.token) || !/^[1-9][0-9]{0,18}$/.test(String(lease.epoch))) {
    fail("ENGINE_WORKER_LEASE_INVALID");
  }
}

/** Private SQL adapter. All transitions/audits are atomic inside the existing SQL functions.
 * Caller supplies a trusted, bounded query executor; no REST or credential/payload reads.
 */
export function createEngineOutboxRepository({ query, workspaceId, worker, leaseSeconds = 30 }) {
  if (typeof query !== "function" || !uuid(workspaceId) || !workerId(worker) ||
      !Number.isInteger(leaseSeconds) || leaseSeconds < 15 || leaseSeconds > 120) {
    fail("ENGINE_WORKER_CONFIG_INVALID");
  }
  async function sql(text, values) {
    try { return await query(text, values); }
    catch { fail("ENGINE_WORKER_STORE_UNAVAILABLE"); }
  }
  const parameters = lease => {
    checkLease(lease);
    if (lease.workspaceId !== workspaceId) fail("ENGINE_WORKER_LEASE_INVALID");
    return [workspaceId, lease.outboxId, worker, lease.token, String(lease.epoch)];
  };
  return Object.freeze({
    async assertSimulation() {
      const { rows } = await sql("select to_regclass('private.atlas_engine_disposable_worker_fixture') is not null and (select count(*)=1 from pg_catalog.pg_attribute where attrelid='auth.users'::regclass and attnum>0 and not attisdropped) as ok", []);
      return rows?.length === 1 && rows[0].ok === true;
    },
    async claim() {
      const { rows } = await sql("select * from private.atlas_engine_worker_claim($1::uuid,$2::text,$3::integer)", [workspaceId, worker, leaseSeconds]);
      if (!Array.isArray(rows) || rows.length > 1) fail("ENGINE_WORKER_LEASE_INVALID");
      if (!rows.length) return null;
      const row = rows[0];
      const lease = { workspaceId, outboxId: row.outbox_id, instanceId: row.instance_id,
        runId: row.run_id, token: row.lease_token, epoch: String(row.lease_epoch) };
      checkLease(lease);
      // Stable across lease owner, epoch and restart. No remote exactly-once claim.
      return Object.freeze(lease);
    },
    async heartbeat(lease) {
      const { rows } = await sql("select private.atlas_engine_worker_heartbeat($1::uuid,$2::uuid,$3::text,$4::uuid,$5::bigint,$6::integer) as ok", [...parameters(lease), leaseSeconds]);
      return rows?.length === 1 && rows[0].ok === true;
    },
    async finish(lease, success) {
      if (typeof success !== "boolean") fail("ENGINE_WORKER_RESULT_INVALID");
      const { rows } = await sql("select private.atlas_engine_worker_finish($1::uuid,$2::uuid,$3::text,$4::uuid,$5::bigint,$6::boolean,$7::text) as state", [...parameters(lease), success, success ? null : "SIMULATION_RETRYABLE"]);
      const state = rows?.length === 1 ? rows[0].state : null;
      if (!(success ? ["delivered"] : ["retry", "dead-letter"]).includes(state)) fail("ENGINE_WORKER_RESULT_INVALID");
      return state;
    },
    async reap() {
      const { rows } = await sql("select private.atlas_engine_worker_reap_exhausted($1::uuid,$2::integer) as count", [workspaceId, 25]);
      const count = rows?.[0]?.count;
      if (!Number.isInteger(count) || count < 0 || count > 25) fail("ENGINE_WORKER_RESULT_INVALID");
      return count;
    },
  });
}

const simulations = new WeakSet();
/** Simulation only. Receipt storage must atomically dedupe the stable operation key.
 * No engine token, URL, payload or HTTP transport is accepted by this factory.
 */
export function createEngineSimulationTransport({ recordReceipt, retryable = false }) {
  if (typeof recordReceipt !== "function" || typeof retryable !== "boolean") fail("ENGINE_SIMULATION_INVALID");
  const transport = Object.freeze({
    async send(lease) {
      if (retryable) return "retryable";
      const outcome = await recordReceipt(Object.freeze({ workspaceId: lease.workspaceId,
        instanceId: lease.instanceId, outboxId: lease.outboxId,
        idempotencyKey: lease.outboxId }));
      if (outcome !== "recorded" && outcome !== "duplicate") fail("ENGINE_SIMULATION_INVALID");
      return outcome;
    },
  });
  simulations.add(transport);
  return transport;
}

/** One bounded simulation step, with no scheduler/real transport/activation path.
 * Uncertain outcomes or lost leases are left to expiry + fenced recovery, not
 * converted into a successful finish or a blind retry of a real external effect.
 */
export async function runEngineSimulationOnce({ repository, transport, signal, timeoutMs = 5000 }) {
  if (!Number.isInteger(timeoutMs) || timeoutMs < 10 || timeoutMs > 5000 ||
      !simulations.has(transport) || !repository ||
      ["assertSimulation", "claim", "heartbeat", "finish"].some(method => typeof repository[method] !== "function")) {
    fail("ENGINE_SIMULATION_REQUIRED");
  }
  const result = state => Object.freeze({ state, simulationOnly: true, canDispatch: false });
  if (signal?.aborted) return result("stopped");
  let lease;
  try {
    if (!await repository.assertSimulation()) return result("simulation-not-configured");
    lease = await repository.claim();
  }
  catch { return result("store-unavailable"); }
  if (!lease) return result("idle");
  checkLease(lease);
  if (!uuid(lease.workspaceId)) fail("ENGINE_WORKER_LEASE_INVALID");
  try {
    if (signal?.aborted) return result("stopped");
    // SQL revalidates instance/run/approval along with lease ownership.
    if (!await repository.heartbeat(lease)) return result("lease-lost");
    if (signal?.aborted) return result("stopped");
    let timer;
    let effect;
    try {
      effect = await Promise.race([
        transport.send(lease),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new EngineWorkerError("ENGINE_SIMULATION_TIMEOUT")), timeoutMs); }),
      ]);
    } finally { clearTimeout(timer); }
    // Recheck after simulated effect, never finish on an expired/revoked lease.
    if (signal?.aborted) return result("recovery-required");
    if (!await repository.heartbeat(lease)) return result("lease-lost");
    return result(await repository.finish(lease, effect !== "retryable"));
  } catch {
    // No raw SQL/provider messages, tokens or lease details escape in results.
    return result("recovery-required");
  }
}
