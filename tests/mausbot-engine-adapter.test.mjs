import test from "node:test";
import assert from "node:assert/strict";
import {
  resolveMausbotConfig, MausbotAdapterError, mausbotHealth, mausbotAgents,
  mausbotDispatch, mausbotJob,
} from "../packages/engines/mausbot/src/adapter.mjs";
import { ENGINE_CATALOG } from "../packages/engine-core/src/catalog.mjs";

const workspaceId = "9e0be460-28de-4e46-86ce-c598f706a54a";
const env = { ATLAS_MAUSBOT_URL: "https://maus.example.test/", ATLAS_MAUSBOT_TOKEN: "secret", ATLAS_MAUSBOT_WORKSPACE_ID: workspaceId };
const config = resolveMausbotConfig(env, workspaceId);

test("Engine catalog keeps MAUSBOT, declares n8n preconnection and leaves Hermes unimplemented", () => {
  assert.deepEqual(ENGINE_CATALOG.map((e) => e.id), ["mausbot", "n8n", "hermes"]);
  assert.deepEqual(ENGINE_CATALOG.find((e) => e.id === "n8n")?.transports, ["http", "mcp"]);
  assert.equal(ENGINE_CATALOG.find((e) => e.id === "hermes")?.capabilities.length, 0);
});

test("MAUSBOT is unavailable to any other workspace, with no fallback", () => {
  assert.equal(resolveMausbotConfig(env, "7e0be460-28de-4e46-86ce-c598f706a54a"), null);
  assert.equal(resolveMausbotConfig({ ...env, ATLAS_MAUSBOT_TOKEN: "" }, workspaceId), null);
  assert.equal(resolveMausbotConfig({ ...env, ATLAS_MAUSBOT_WORKSPACE_ID: "" }, workspaceId), null);
  for (const url of ["http://maus.example.test/", "https://maus.example.test/a", "https://me:pwd@maus.example.test/"]) {
    assert.throws(() => resolveMausbotConfig({ ...env, ATLAS_MAUSBOT_URL: url }, workspaceId), MausbotAdapterError);
  }
  assert.equal(resolveMausbotConfig({ ...env, ATLAS_MAUSBOT_URL: "http://127.0.0.1:8799/" }, workspaceId)?.baseUrl, "http://127.0.0.1:8799");
});

test("Health confirms actual MAUSBOT identity and keeps bearer token server-side", async () => {
  let seen;
  const result = await mausbotHealth(config, { fetchImpl: async (url, init) => {
    seen = { url, init };
    return Response.json({ app: "openmausbot" });
  } });
  assert.equal(result.online, true);
  assert.equal(seen.url, "https://maus.example.test/api/health");
  assert.equal(seen.init.headers.Authorization, "Bearer secret");
  assert.equal(seen.init.redirect, "manual");
  await assert.rejects(mausbotHealth(config, { fetchImpl: async () => Response.json({ app: "wrong" }) }),
    (error) => error.code === "MAUSBOT_IDENTITY_MISMATCH");
});

test("MAUSBOT agent inventory comes from the engine; malformed results are rejected", async () => {
  const agents = await mausbotAgents(config, { fetchImpl: async () => Response.json({ bots: [
    { id: "a-1", name: "Agent A", emoji: "🤖" }, { id: "bad/id", name: "Bad" },
  ] }) });
  assert.equal(agents.length, 1);
  assert.equal(agents[0].name, "Agent A");
  await assert.rejects(mausbotAgents(config, { fetchImpl: async () => Response.json({ bots: null }) }),
    (error) => error.code === "MAUSBOT_RESPONSE_INVALID");
});

test("Dispatch verifies bot, creates an ask-only task, sends instruction once and returns receipt", async () => {
  const requests = [];
  const result = await mausbotDispatch(config,
    { botId: "bot-1", title: "Audit", instruction: "Analyser le projet" },
    { fetchImpl: async (url, init) => {
      requests.push({ url, init });
      if (url.endsWith("/api/bots")) return Response.json({ bots: [{ id: "bot-1", name: "Analyste" }] });
      if (url.endsWith("/tasks")) return Response.json({ task: { threadId: "thread-1" } }, { status: 201 });
      if (url.endsWith("/messages")) return Response.json({ ok: true }, { status: 202 });
      throw Error("unexpected URL");
    } });
  assert.equal(result.accepted, true);
  assert.equal(result.threadId, "thread-1");
  assert.equal(requests.length, 3);
  assert.deepEqual(JSON.parse(requests[1].init.body), { title: "Audit", approvalMode: "ask" });
  const payload = JSON.parse(requests[2].init.body);
  assert.equal(payload.threadId, "thread-1");
  assert.equal(payload.text, "Analyser le projet");
  assert.match(payload.sendId, /^[A-Za-z0-9_-]{16,80}$/);
});

test("Dispatch retains created thread when upstream message fails", async () => {
  const outcome = await mausbotDispatch(config, { botId: "x", title: "T", instruction: "Instruction" }, {
    fetchImpl: async (url) => {
      if (url.endsWith("/api/bots")) return Response.json({ bots: [{ id: "x" }] });
      if (url.endsWith("/tasks")) return Response.json({ task: { threadId: "existing" } }, { status: 201 });
      return Response.json({ error: "hidden upstream token" }, { status: 500 });
    },
  });
  assert.equal(outcome.taskCreated, true);
  assert.equal(outcome.accepted, false);
  assert.equal(outcome.threadId, "existing");
  assert.equal(outcome.error, "MAUSBOT_UPSTREAM_ERROR");
  assert.equal(JSON.stringify(outcome).includes("hidden upstream token"), false);
});

test("Job reads bounded status without exposing arbitrary upstream response", async () => {
  const job = await mausbotJob(config, "thread-1", { fetchImpl: async () =>
    Response.json({ status: "settled", state: "failed", version: 7, secret: "not exposed" }) });
  assert.deepEqual(job, { threadId: "thread-1", status: "settled", state: "failed", version: 7, phase: null });
  await assert.rejects(mausbotJob(config, "../../etc/passwd"), (error) => error.code === "MAUSBOT_ID_INVALID");
});
