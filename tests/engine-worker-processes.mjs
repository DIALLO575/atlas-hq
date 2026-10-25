/** Disposable PG17 integration: independent Node processes and actual SIGKILL. */
import { fork } from "node:child_process";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import pg from "pg";
import { createEngineOutboxRepository } from "../packages/engine-core/src/outbox-worker.mjs";
if (process.env.ATLAS_ENGINE_DISPOSABLE_TEST !== "1" || !["127.0.0.1", "localhost"].includes(process.env.PGHOST)) throw Error("DISPOSABLE_ONLY");
const client = new pg.Client({ connectionTimeoutMillis: 3000, statement_timeout: 5000 });
await client.connect();
const children = new Set();
const workspace = randomUUID(), instance = randomUUID(), run = randomUUID(), mission = randomUUID();
const requester = "11111111-1111-4111-8111-111111111111", reviewer = "33333333-3333-4333-8333-333333333333";
const sql = (text, values = []) => client.query(text, values);
async function enqueue(attempts = 0) {
  const id = randomUUID();
  await sql(`insert into private.atlas_engine_outbox(id,workspace_id,instance_id,run_id,idempotency_key,key_id,version,
    payload_nonce,payload_ciphertext,payload_tag,attempt_count)
    values($1,$2,$3,$4,$5,'simulation-key',1,decode(repeat('0a',12),'hex'),decode('aabb','hex'),decode(repeat('1a',16),'hex'),$6)`,
  [id, workspace, instance, run, randomUUID(), attempts]);
  return id;
}
async function expire(id) {
  await sql("update private.atlas_engine_outbox set lease_until=clock_timestamp()-interval '1 second' where id=$1 and state='leased'", [id]);
}
async function countEffects(id) {
  return Number((await sql("select count(*) as n from private.atlas_engine_disposable_worker_fixture where workspace_id=$1 and operation_id=$2", [workspace, id])).rows[0].n);
}
async function state(id) { return (await sql("select state from private.atlas_engine_outbox where id=$1", [id])).rows[0].state; }
function launch(worker, mode = "normal") {
  const proc = fork(new URL("./support/engine-simulation-child.mjs", import.meta.url), [workspace, worker, mode], { stdio: ["ignore", "pipe", "pipe", "ipc"] });
  children.add(proc);
  const events = [];
  let stderr = "";
  proc.stderr.on("data", data => { stderr += data; });
  proc.stdout.resume();
  let exitCode;
  const exited = new Promise(resolve => proc.on("exit", (code, signal) => {
    exitCode = code ?? signal; children.delete(proc); resolve(exitCode);
  }));
  proc.on("message", event => events.push(event));
  return {
    proc, exited,
    async event(name) {
      const deadline = Date.now() + 10000;
      while (!events.some(event => event.event === name)) {
        assert.equal(exitCode, undefined, `Worker exited before ${name}: ${stderr}`);
        assert.ok(Date.now() < deadline, `Worker timeout waiting ${name}: ${stderr}`);
        await new Promise(resolve => setTimeout(resolve, 15));
      }
      return events.find(event => event.event === name);
    },
    async result() { const event = await this.event("result"); assert.equal(await exited, 0, stderr); return event.result; },
  };
}
const repo = worker => createEngineOutboxRepository({ query: sql, workspaceId: workspace, worker, leaseSeconds: 15 });
try {
  const columns = await sql("select count(*)::integer as n from pg_catalog.pg_attribute where attrelid='auth.users'::regclass and attnum>0 and not attisdropped");
  assert.equal(columns.rows[0].n, 1, "Minimal fake Auth schema required before any fixture writes");
  await sql(`create table private.atlas_engine_disposable_worker_fixture(
    workspace_id uuid not null,instance_id uuid not null,operation_id uuid not null,
    primary key(workspace_id,instance_id,operation_id));
    alter table private.atlas_engine_disposable_worker_fixture enable row level security;
    grant select,insert on private.atlas_engine_disposable_worker_fixture to service_role;`);
  await sql("insert into public.workspaces(id) values($1)", [workspace]);
  await sql("insert into public.workspace_members(workspace_id,user_id,role) values($1,$2,'owner'),($1,$3,'admin')", [workspace, requester, reviewer]);
  await sql("insert into public.atlas_missions(id,workspace_id) values($1,$2)", [mission, workspace]);
  await sql("insert into public.atlas_engine_instances(id,workspace_id,engine_key,label,created_by) values($1,$2,'mausbot','Disposable simulation',$3)", [instance, workspace, requester]);
  await sql("insert into public.atlas_engine_runs(id,workspace_id,instance_id,mission_id,requested_by,primitive_id,payload_sha256) values($1,$2,$3,$4,$5,'agents.list',repeat('a',64))", [run, workspace, instance, mission, requester]);
  await sql(`insert into private.atlas_engine_approvals(workspace_id,instance_id,run_id,requested_by,expires_at,intent_digest)
    values($1,$2,$3,$4,now()+interval '1 hour',private.atlas_engine_intent_digest($1,$2,$3,$5,'agents.list',repeat('a',64)))`, [workspace, instance, run, requester, mission]);
  await sql("update private.atlas_engine_approvals set decision='approved',decided_by=$2,decided_at=now() where run_id=$1", [run, reviewer]);
  await sql("update public.atlas_engine_runs set state='authorized' where id=$1", [run]);

  // An offline fixture stays unclaimable, even with the worker process running.
  const firstId = await enqueue();
  assert.equal((await launch("offline").result()).state, "idle");
  assert.equal(await countEffects(firstId), 0);
  await sql("update public.atlas_engine_instances set connection_state='connected' where id=$1", [instance]);

  // A holds an uncommitted claim. B must SKIP LOCKED and finish idle, not block.
  const first = launch("claim-a", "hold-claim"); await first.event("claim-locked");
  assert.equal((await launch("claim-b").result()).state, "idle");
  first.proc.send("commit"); assert.equal((await first.result()).state, "delivered");
  assert.equal(await countEffects(firstId), 1);
  console.log("Two processes: locked claim skipped, one simulated effect and delivery.");

  for (const phase of ["before-effect", "after-effect"]) {
    const id = await enqueue();
    const crashed = launch(`crash-${phase}`, phase); await crashed.event(phase);
    assert.equal(await countEffects(id), phase === "before-effect" ? 0 : 1);
    crashed.proc.kill("SIGKILL"); assert.equal(await crashed.exited, "SIGKILL");
    await expire(id);
    assert.equal((await launch(`recover-${phase}`).result()).state, "delivered");
    assert.equal(await countEffects(id), 1); assert.equal(await state(id), "delivered");
    assert.equal(Number((await sql("select lease_epoch from private.atlas_engine_outbox where id=$1", [id])).rows[0].lease_epoch), 2);
    assert.equal(Number((await sql("select count(*) as n from private.atlas_engine_audit_events where run_id=$1 and event_key='engine.outbox.delivered'", [run])).rows[0].n), phase === "before-effect" ? 2 : 3);
    console.log(`SIGKILL ${phase}: expired lease recovered, stable simulated operation deduplicated.`);
  }

  // Old process resumes after a new worker has acquired and completed the job.
  const staleId = await enqueue(); const stale = launch("stale-owner", "before-effect");
  await stale.event("before-effect"); await expire(staleId);
  assert.equal((await launch("new-owner").result()).state, "delivered");
  stale.proc.send("resume"); assert.equal((await stale.result()).state, "lease-lost");
  assert.equal(await countEffects(staleId), 1);
  console.log("Stale process fenced after new owner; no second simulated effect.");

  // Revocation after claim must stop the process before the simulated send.
  const revokedId = await enqueue(); const revoked = launch("revoked-owner", "before-effect");
  await revoked.event("before-effect");
  await sql("update public.atlas_engine_instances set connection_state='offline' where id=$1", [instance]);
  revoked.proc.send("resume"); assert.equal((await revoked.result()).state, "lease-lost");
  assert.equal(await countEffects(revokedId), 0);
  await sql("update private.atlas_engine_outbox set state='dead-letter',lease_token=null,lease_owner=null,lease_until=null where id=$1", [revokedId]);
  await sql("update public.atlas_engine_instances set connection_state='connected' where id=$1", [instance]);
  console.log("Instance revoked after claim: no simulated send or successful finish.");

  const retryId = await enqueue(4);
  assert.equal((await launch("final-retry", "retryable").result()).state, "dead-letter");
  assert.equal(await countEffects(retryId), 0);
  const exhaustedId = await enqueue(4);
  const exhausted = launch("exhausted", "before-effect"); await exhausted.event("before-effect");
  exhausted.proc.kill("SIGKILL"); await exhausted.exited; await expire(exhaustedId);
  assert.equal(await repo("reaper").reap(), 1); assert.equal(await repo("reaper").reap(), 0);
  assert.equal(await state(exhaustedId), "dead-letter");
  console.log("Final attempt crash: bounded reaper is idempotent; retryable failure dead-letters.");
} finally {
  for (const child of children) child.kill("SIGKILL");
  await Promise.allSettled([...children].map(child => new Promise(resolve => child.once("exit", resolve))));
  await client.end();
}
