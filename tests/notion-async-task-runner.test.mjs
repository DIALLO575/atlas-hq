import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runNotionAsyncTaskWorker } from "../src/lib/notion/async-task-runner-core.mjs";

const claim = Object.freeze({
  job_id: "11111111-1111-4111-8111-111111111111",
  lease_id: "22222222-2222-4222-8222-222222222222",
  connection_id: "33333333-3333-4333-8333-333333333333",
  workspace_id: "44444444-4444-4444-8444-444444444444",
  user_id: "55555555-5555-4555-8555-555555555555",
  notion_workspace_id: "66666666-6666-4666-8666-666666666666",
  credential_version: 2,
  provider_task_id: "task_fake123",
});
const probeLeaseId = "77777777-7777-4777-8777-777777777777";

function fakeAdmin({ role = "owner", connectionOverrides = {}, claimError = null,
  probeId = probeLeaseId } = {}) {
  const rpcCalls = [];
  const queries = [];
  const events = [];
  const admin = {
    async rpc(name, args) {
      rpcCalls.push({ name, args });
      events.push(`rpc:${name}`);
      if (name === "atlas_notion_claim_async_task") {
        return claimError
          ? { data: null, error: claimError }
          : { data: [claim], error: null };
      }
      if (name === "atlas_notion_reserve_rest_read") {
        return { data: { delay_ms: 0, probe_lease_id: probeId }, error: null };
      }
      if (name === "atlas_notion_report_rest_outcome" ||
          name === "atlas_notion_finish_async_task") {
        return { data: true, error: null };
      }
      throw new Error(`Unexpected RPC: ${name}`);
    },
    from(table) {
      const query = { table, filters: [] };
      queries.push(query);
      const builder = {
        select(columns) { query.columns = columns; return builder; },
        eq(column, value) { query.filters.push(["eq", column, value]); return builder; },
        is(column, value) { query.filters.push(["is", column, value]); return builder; },
        gt(column, value) { query.filters.push(["gt", column, value]); return builder; },
        async maybeSingle() {
          events.push(`read:${table}`);
          if (table === "atlas_notion_connections") {
            return { data: { notion_bot_id: "fake-bot", refresh_attempt_id: null,
              ...connectionOverrides }, error: null };
          }
          if (table === "atlas_connections") {
            return { data: { id: claim.connection_id, status: "connected" }, error: null };
          }
          if (table === "workspace_members") return { data: { role }, error: null };
          if (table === "atlas_notion_async_jobs") return { data: { id: claim.job_id }, error: null };
          throw new Error(`Unexpected table: ${table}`);
        },
      };
      return builder;
    },
  };
  return { admin, rpcCalls, queries, events };
}

function assertQueryHas(query, filter) {
  assert.ok(query.filters.some(value => JSON.stringify(value) === JSON.stringify(filter)),
    `Missing query filter: ${JSON.stringify(filter)}`);
}

test("server runner binds RPCs, verifies actor and lease, then makes exactly one fixed GET", async () => {
  const fake = fakeAdmin();
  const decrypted = [];
  const requests = [];
  const metrics = [];
  const vault = { decryptTokens(connection, binding) {
    decrypted.push({ connection, binding });
    fake.events.push("decrypt");
    return { accessToken: "test-only-token" };
  } };

  const result = await runNotionAsyncTaskWorker({
    admin: fake.admin,
    vault,
    onMetric: name => metrics.push(name),
    async fetchImpl(input, init) {
      requests.push({ input, init });
      fake.events.push("fetch");
      return new Response(JSON.stringify({ object: "async_task", id: claim.provider_task_id,
        status: "succeeded", result: { content: "not persisted" } }), {
        status: 200, headers: { "content-type": "application/json" },
      });
    },
  });

  assert.deepEqual(result, { state: "succeeded" });
  assert.deepEqual(metrics, ["succeeded"]);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].input,
    `https://api.notion.com/v1/async_tasks/${claim.provider_task_id}`);
  assert.equal(requests[0].init.method, "GET");
  assert.equal(requests[0].init.headers.Authorization, "Bearer test-only-token");
  assert.equal(requests[0].init.cache, "no-store");
  assert.equal("body" in requests[0].init, false);
  assert.deepEqual(decrypted[0].binding, {
    atlasWorkspaceId: claim.workspace_id, actorUserId: claim.user_id,
    notionWorkspaceId: claim.notion_workspace_id, notionBotId: "fake-bot",
  });

  assert.deepEqual(fake.rpcCalls.map(call => call.name), [
    "atlas_notion_claim_async_task", "atlas_notion_reserve_rest_read",
    "atlas_notion_report_rest_outcome", "atlas_notion_finish_async_task",
  ]);
  assert.deepEqual(fake.rpcCalls[0].args, { p_lease_seconds: 90 });
  assert.deepEqual(fake.rpcCalls[1].args, {
    p_connection_id: claim.connection_id, p_workspace_id: claim.workspace_id,
    p_user_id: claim.user_id, p_notion_workspace_id: claim.notion_workspace_id,
    p_expected_version: claim.credential_version, p_max_wait_ms: 3000,
  });
  assert.deepEqual(fake.rpcCalls[2].args, {
    p_connection_id: claim.connection_id, p_workspace_id: claim.workspace_id,
    p_user_id: claim.user_id, p_notion_workspace_id: claim.notion_workspace_id,
    p_expected_version: claim.credential_version, p_outcome: "success",
    p_probe_lease_id: probeLeaseId,
  });
  assert.deepEqual(fake.rpcCalls[3].args, {
    p_job_id: claim.job_id, p_lease_id: claim.lease_id,
    p_outcome: "succeeded", p_delay_seconds: 3, p_error_code: null,
  });

  const connectionQuery = fake.queries.find(query => query.table === "atlas_notion_connections");
  assertQueryHas(connectionQuery, ["eq", "connection_id", claim.connection_id]);
  assertQueryHas(connectionQuery, ["eq", "workspace_id", claim.workspace_id]);
  assertQueryHas(connectionQuery, ["eq", "user_id", claim.user_id]);
  assertQueryHas(connectionQuery, ["eq", "notion_workspace_id", claim.notion_workspace_id]);
  assertQueryHas(connectionQuery, ["eq", "version", claim.credential_version]);
  assertQueryHas(connectionQuery, ["is", "revoked_at", null]);
  const leaseQuery = fake.queries.find(query => query.table === "atlas_notion_async_jobs");
  assertQueryHas(leaseQuery, ["eq", "lease_id", claim.lease_id]);
  assertQueryHas(leaseQuery, ["eq", "status", "leased"]);
  assert.ok(leaseQuery.filters.some(([op, column, value]) =>
    op === "gt" && column === "lease_until" && Number.isFinite(Date.parse(value))));
  assert.ok(fake.events.indexOf("rpc:atlas_notion_reserve_rest_read") < fake.events.indexOf("fetch"));
  assert.ok(fake.events.indexOf("read:atlas_notion_async_jobs") < fake.events.indexOf("fetch"));
  assert.ok(fake.events.indexOf("fetch") < fake.events.indexOf("rpc:atlas_notion_report_rest_outcome"));
});

test("non-admin membership is denied before token decrypt or external GET", async () => {
  const fake = fakeAdmin({ role: "member" });
  let decryptCalls = 0;
  let fetchCalls = 0;
  const result = await runNotionAsyncTaskWorker({
    admin: fake.admin,
    vault: { decryptTokens() { decryptCalls += 1; return { accessToken: "test-only-token" }; } },
    async fetchImpl() { fetchCalls += 1; throw new Error("must not fetch"); },
  });
  assert.deepEqual(result, { state: "dead" });
  assert.equal(decryptCalls, 0);
  assert.equal(fetchCalls, 0);
  assert.deepEqual(fake.rpcCalls.at(-1), {
    name: "atlas_notion_finish_async_task",
    args: { p_job_id: claim.job_id, p_lease_id: claim.lease_id,
      p_outcome: "permanent", p_delay_seconds: 3, p_error_code: "permission_denied" },
  });
  assert.equal(fake.rpcCalls.some(call => call.name === "atlas_notion_reserve_rest_read"), false);
});

test("claim RPC errors are reduced to a fixed store error and never reach GET", async () => {
  const fake = fakeAdmin({ claimError: { message: "private database details" } });
  let fetchCalls = 0;
  await assert.rejects(runNotionAsyncTaskWorker({
    admin: fake.admin,
    vault: { decryptTokens() { throw new Error("must not decrypt"); } },
    async fetchImpl() { fetchCalls += 1; throw new Error("must not fetch"); },
  }), { message: "NOTION_ASYNC_STORE_UNAVAILABLE" });
  assert.equal(fetchCalls, 0);
  assert.deepEqual(fake.rpcCalls.map(call => call.name), ["atlas_notion_claim_async_task"]);
});

test("the testable core is called only through the server-only runner entrypoint", async () => {
  const entry = await readFile(new URL("../src/lib/notion/async-task-runner.ts", import.meta.url), "utf8");
  assert.match(entry, /^import ["']server-only["'];/);
  assert.match(entry, /runNotionAsyncTaskWorker\(\{ admin, vault, onMetric \}\)/);
});
