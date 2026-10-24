import test from "node:test";
import assert from "node:assert/strict";
import { MAUSBOT_PRIMITIVES, PrimitiveInputError } from "../packages/engine-core/src/primitives.mjs";
import {
  planMausbotMcpCall, normalizeMausbotMcpResponse,
  parseMausbotSseBlock, planMausbotCli, MAUSBOT_MCP_TOOL_COUNT,
} from "../packages/engines/mausbot/src/protocols.mjs";

test("Each of the 20 MCP operations maps to its exact server-advertised name", () => {
  assert.equal(MAUSBOT_MCP_TOOL_COUNT, 20);
  for (let i = 0; i < MAUSBOT_PRIMITIVES.length; i++) {
    const def = MAUSBOT_PRIMITIVES[i];
    if (def.required.length) continue;
    const request = planMausbotMcpCall(def.id, {}, i);
    assert.equal(request.params.name, def.tool);
    assert.deepEqual(request.params.arguments, {});
    assert.equal(request.method, "tools/call");
  }
  const edit = planMausbotMcpCall("conversations.messages.edit", {
    bot_id: "bot-A", message_id: "msg-1", text: "fixed",
  }, "run-1");
  assert.equal(edit.params.name, "edit_bot_message");
  assert.equal(edit.id, "run-1");
  assert.throws(() => planMausbotMcpCall("approvals.answer"), PrimitiveInputError);
});

test("MCP responses require matching JSON-RPC ID and never return raw tool payload", () => {
  assert.deepEqual(normalizeMausbotMcpResponse(JSON.stringify({
    jsonrpc: "2.0", id: "abc", result: { content: [{ text: "PRIVATE" }] },
  }), "abc"), { acknowledged: true, hasToolResult: true });
  assert.throws(() => normalizeMausbotMcpResponse(JSON.stringify({
    jsonrpc: "2.0", id: "other", result: {},
  }), "abc"), PrimitiveInputError);
  assert.throws(() => normalizeMausbotMcpResponse(JSON.stringify({
    jsonrpc: "2.0", id: "abc", error: { code: -32603, message: "PRIVATE" },
  }), "abc"), PrimitiveInputError);
});

test("SSE parser reads cursor and hello replay status without leaking secrets", () => {
  const hello = parseMausbotSseBlock('id: c1\n' +
    'data: {"kind":"hello","resumed":false,"cursor":"c1","secrets":"private"}\n\n');
  assert.equal(hello.cursor, "c1");
  assert.equal(hello.requiresResync, true);
  assert.equal(JSON.stringify(hello).includes("private"), false);
});

test("SSE message frame preserves useful text but drops base64 screenshot/card grants", () => {
  const event = parseMausbotSseBlock('id: 12\n' +
    'data: {"kind":"message","threadId":"t-1","message":{"id":"m1","role":"bot","kind":"screen","png":"PIXELS","secret":"SECRET","card":{"grantKey":"GRANT"}}}\n\n');
  assert.equal(event.message.hasImage, true);
  assert.equal(JSON.stringify(event).includes("PIXELS"), false);
  assert.equal(JSON.stringify(event).includes("SECRET"), false);
  assert.equal(JSON.stringify(event).includes("GRANT"), false);
});

test("SSE stream rejects oversized and invalid frames", () => {
  assert.throws(() => parseMausbotSseBlock("data: " + "a".repeat(65536)), PrimitiveInputError);
  assert.throws(() => parseMausbotSseBlock("data: bad-json\n\n"), PrimitiveInputError);
  assert.equal(parseMausbotSseBlock(": heartbeat\n\n"), null);
});

test("CLI plans are argv arrays, never shell-executed on Vercel; team mutations need explicit approval", () => {
  const preview = planMausbotCli("teams.dry-run", {file:"/srv/atlas/teams/alpha.yaml"});
  assert.equal(preview.shell, false);
  assert.equal(preview.spawnAllowedOnVercel, false);
  assert.deepEqual(preview.argv, ["team", "apply", "/srv/atlas/teams/alpha.yaml", "--dry-run", "--json"]);
  const apply = planMausbotCli("teams.apply", {file:"/srv/atlas/teams/alpha.yaml",approved:true});
  assert.equal(apply.argv.includes("--dry-run"), false);
  assert.throws(() => planMausbotCli("teams.apply", {file:"/srv/atlas/teams/alpha.yaml"}), PrimitiveInputError);
  assert.throws(() => planMausbotCli("teams.apply", {file:"/srv/atlas/teams/../other.yaml", approved: true}), PrimitiveInputError);
  assert.throws(() => planMausbotCli("credentials.set", {}), PrimitiveInputError);
});
