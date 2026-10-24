import test from "node:test";
import assert from "node:assert/strict";
import { MAUSBOT_PRIMITIVES, MAUSBOT_FUTURE_SURFACES, validateMausbotPrimitive, PrimitiveInputError } from "../packages/engine-core/src/primitives.mjs";
import { executeMausbotPrimitive } from "../packages/engines/mausbot/src/primitives.mjs";

const config = { baseUrl: "https://maus.example.test", token: "fake-test-token" };
const providerBot = {
  id: "bot-1", name: "Auditeur", threadId: "thread-1", busy: false,
  tasks: [{ threadId: "thread-1", title: "Travail", busy: false }],
};
const providerGroup = {
  id: "group-1", name: "Équipe", threadId: "channel-thread-1", memberIds: ["bot-1"], working: false,
  tasks: [{ threadId: "channel-thread-1", title: "Discussion", working: false }],
};
const instance = {
  instanceId: "instance-1", displayName: "Claude", driverKind: "claude",
  snapshot: { state: "available" },
  models: { default: "model-1", options: [{ id: "model-1" }] },
  capabilities: { effortLevels: ["low", "high"] }, executablePath: "/private/path",
};
const fakeFetch = (requests, overrides = {}) => async (rawUrl, init) => {
  const url = new URL(rawUrl);
  const path = url.pathname;
  const record = { path: url.pathname + url.search, method: init.method, body: init.body ? JSON.parse(init.body) : undefined };
  requests.push(record);
  if (overrides[path]) return overrides[path](record);
  if (path === "/api/health") return Response.json({ app: "openmausbot" });
  if (path === "/api/bots") return Response.json({ bots: [providerBot], groups: [providerGroup], hiddenSecret: "not forwarded" });
  if (path === "/api/instances") return Response.json({ instances: [instance] });
  if (path === "/api/bots/bot-1/messages" || path === "/api/groups/group-1/messages") {
    return Response.json({ message: { id: "message-1", at: 123 }, queued: false }, { status: 202 });
  }
  if (path === "/api/threads/thread-1/messages" || path === "/api/threads/channel-thread-1/messages") {
    return Response.json({ messages: [
      { id: "screen-1", kind: "screen", png: "BASE64-PIXELS", hasImage: true, credential: "LEAK", text: "capture" },
      { id: "msg-2", kind: "text", role: "bot", text: "OK", secret: { value: "PRIVATE" }, card: { title: "Attention", grantKey: "PRIVATE" } },
    ], hasMore: false });
  }
  if (path === "/api/bots") return Response.json({ bots: [providerBot], groups: [providerGroup] });
  if (path === "/api/bots/bot-1/tasks" || path === "/api/groups/group-1/tasks") {
    return Response.json({ task: { threadId: "new-thread", title: "Created" } }, { status: 201 });
  }
  if (path.startsWith("/api/bots/bot-1/tasks/") || path.startsWith("/api/groups/group-1/tasks/"))
    return Response.json({ task: { threadId: "thread-1", title: "Renommée" }, bot: providerBot });
  if (path === "/api/bots") return Response.json({ bot: providerBot });
  if (path === "/api/bots/bot-1") return Response.json({ bot: providerBot });
  if (path === "/api/groups") return Response.json({ group: providerGroup });
  if (path === "/api/groups/group-1") return Response.json({ group: providerGroup });
  if (path === "/api/threads/thread-1/job") return Response.json({ state: "failed", version: "v3", job: { secret: "PRIVATE" } });
  if (path === "/api/search") return Response.json({ hits: [{ id: "msg-2", text: "OK", secret: "PRIVATE" }] });
  if (path.endsWith("/interrupt")) return Response.json({ ok: true });
  if (path.endsWith("/edit")) return Response.json({ message: { id: "msg-2", text: "corrigé", password: "PRIVATE" } });
  return Response.json({ error: "unmatched mock path" }, { status: 404 });
};
// Create is special: POST /api/bots collides with GET. Respect request method in the mock.
function transport(requests, overrides = {}) {
  const fallback = fakeFetch(requests, overrides);
  return async (url, init) => {
    const path = new URL(url).pathname;
    if (path === "/api/bots" && init.method === "POST") {
      requests.push({ path, method: init.method, body: JSON.parse(init.body) });
      return Response.json({ bot: providerBot }, { status: 201 });
    }
    return fallback(url, init);
  };
}
const cases = [
  ["system.health", {}, "/api/health", "GET"],
  ["agents.list", {}, "/api/bots", "GET"],
  ["conversations.messages.list", { bot_id: "bot-1" }, "/api/threads/thread-1/messages", "GET"],
  ["conversations.messages.send", { bot_id: "bot-1", text: "Do work", send_id: "A".repeat(16) }, "/api/bots/bot-1/messages", "POST"],
  ["agents.create", { name: "New agent" }, "/api/bots", "POST"],
  ["agents.update", { bot_id: "bot-1", name: "Renommé" }, "/api/bots/bot-1", "PATCH"],
  ["channels.list", {}, "/api/bots", "GET"],
  ["channels.messages.list", { channel_id: "group-1" }, "/api/threads/channel-thread-1/messages", "GET"],
  ["channels.messages.send", { channel_id: "group-1", text: "Hey" }, "/api/groups/group-1/messages", "POST"],
  ["channels.create", { name: "Room", member_ids: ["bot-1"] }, "/api/groups", "POST"],
  ["channels.update", { channel_id: "group-1", bulletin: "new" }, "/api/groups/group-1", "PATCH"],
  ["tasks.create", { target_type: "bot", target_id: "bot-1", title: "Audit" }, "/api/bots/bot-1/tasks", "POST"],
  ["tasks.activate", { target_type: "bot", target_id: "bot-1", task_id: "thread-1" }, "/api/bots/bot-1/tasks/thread-1", "POST"],
  ["tasks.rename", { target_type: "bot", target_id: "bot-1", task_id: "thread-1", title: "Audit" }, "/api/bots/bot-1/tasks/thread-1", "PATCH"],
  ["search.messages", { query: "audit" }, "/api/search", "GET"],
  ["jobs.wait", { target_type: "bot", target_id: "bot-1" }, "/api/threads/thread-1/job", "GET"],
  ["models.set", { bot_id: "bot-1", instance_id: "instance-1", model: "model-1" }, "/api/bots/bot-1", "PATCH"],
  ["conversations.messages.edit", { bot_id: "bot-1", message_id: "msg-2", text: "fix" }, "/api/bots/bot-1/messages/msg-2/edit", "POST"],
  ["models.list", {}, "/api/instances", "GET"],
  ["jobs.interrupt", { target_type: "bot", target_id: "bot-1" }, "/api/bots/bot-1/interrupt", "POST"],
];

test("Twenty source-mapped primitive contracts cover precisely the documented MCP tools", () => {
  assert.equal(MAUSBOT_PRIMITIVES.length, 20);
  assert.equal(new Set(MAUSBOT_PRIMITIVES.map((p) => p.id)).size, 20);
  assert.deepEqual(new Set(MAUSBOT_PRIMITIVES.map((p) => p.id)), new Set(cases.map((c) => c[0])));
  assert.ok(MAUSBOT_FUTURE_SURFACES.some((p) => p.id === "computer.control" && p.status === "restricted"));
  assert.ok(MAUSBOT_FUTURE_SURFACES.some((p) => p.id === "approvals.answer" && p.status === "restricted"));
});

for (const [name, input, route, method] of cases) {
  test(name + " maps to verified MAUSBOT HTTP route and verb", async () => {
    const sent = [];
    const result = await executeMausbotPrimitive(config, name, input, { fetchImpl: transport(sent) });
    assert.ok(result && typeof result === "object");
    assert.ok(sent.some((r) => r.path.split("?")[0] === route && r.method === method),
      name + " route " + route + " " + method + " missing: " + JSON.stringify(sent));
    const json = JSON.stringify(result);
    assert.equal(json.includes("PRIVATE"), false);
    assert.equal(json.includes("BASE64-PIXELS"), false);
    assert.equal(json.includes("fake-test-token"), false);
  });
}

test("Created MAUSBOT task is always ask-only, never Full", async () => {
  const sent = [];
  await executeMausbotPrimitive(config, "tasks.create",
    { target_type: "bot", target_id: "bot-1" }, { fetchImpl: transport(sent) });
  assert.equal(sent.find((r) => r.path === "/api/bots/bot-1/tasks").body.approvalMode, "ask");
});

test("Sending to a non-owned bot thread is rejected before writes", async () => {
  const sent = [];
  await assert.rejects(executeMausbotPrimitive(config, "conversations.messages.send",
    { bot_id: "bot-1", task_id: "foreign-thread", text: "do stuff" }, { fetchImpl: transport(sent) }),
    (error) => error.code === "PRIMITIVE_THREAD_NOT_OWNED");
  assert.equal(sent.some((r) => r.method === "POST"), false);
});

test("Malformed input and privilege-escalation fields are rejected before network I/O", async () => {
  const bad = [
    ["agents.create", { name: "Test", approvalMode: "full" }],
    ["tasks.create", { target_type: "bot", target_id: "bot-1", permissions: "full" }],
    ["conversations.messages.send", { bot_id: "bot-1", text: "", send_id: "too-short" }],
    ["models.set", { bot_id: "bot-1", model: "unknown", instance_id: "instance-1", effort: "unlimited" }],
    ["jobs.wait", { target_type: "bot", target_id: "bot-1", timeout_seconds: 900 }],
    ["channels.create", { name: "x", member_ids: ["bot-1", "bot-1"] }],
    ["channels.create", { name: "x", member_ids: ["bot-1"], default_responder: { kind: "member", bot_id: "intruder" } }],
    ["jobs.interrupt", { target_type: "bot", target_id: "../other" }],
    ["approvals.answer", { id: "x" }],
  ];
  for (const [name, input] of bad) {
    assert.throws(() => validateMausbotPrimitive(name, input), PrimitiveInputError, name);
  }
});

test("Read of conversation cannot expose screenshot pixels or provider secrets", async () => {
  const result = await executeMausbotPrimitive(config, "conversations.messages.list",
    { bot_id: "bot-1" }, { fetchImpl: transport([]) });
  assert.equal(result.messages[0].hasImage, true);
  assert.equal(result.messages[0].png, undefined);
  assert.equal(result.messages[1].card.grantKey, undefined);
  assert.equal(result.messages[1].secret, undefined);
});

test("Model changes are only allowed for available exact models; no unadvertised model", async () => {
  const sent = [];
  await assert.rejects(executeMausbotPrimitive(config, "models.set",
    { bot_id: "bot-1", instance_id: "instance-1", model: "model-does-not-exist" }, { fetchImpl: transport(sent) }),
    (error) => error.code === "PRIMITIVE_MODEL_NOT_OFFERED");
  assert.equal(sent.some((r) => r.method === "PATCH"), false);
});

test("Jobs.wait returns bounded projection; a failed job never silently becomes success", async () => {
  const sent = [];
  const result = await executeMausbotPrimitive(config, "jobs.wait",
    { target_type: "bot", target_id: "bot-1", timeout_seconds: 120 }, { fetchImpl: transport(sent) });
  assert.equal(result.state, "failed");
  assert.equal(JSON.stringify(result).includes("PRIVATE"), false);
  const query = new URL("https://test.invalid" + sent.find((r) => r.path.includes("/job?")).path).searchParams;
  assert.equal(query.get("wait"), "24000");
});

test("Unsupported primitive fails closed", async () => {
  let calls = 0;
  await assert.rejects(executeMausbotPrimitive(config, "computer.control", {},
    { fetchImpl: async () => { calls++; throw Error("must not call"); } }), PrimitiveInputError);
  assert.equal(calls, 0);
});
