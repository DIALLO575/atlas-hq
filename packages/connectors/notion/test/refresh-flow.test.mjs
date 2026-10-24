import test from "node:test";
import assert from "node:assert/strict";
import { rotateNotionCredentials } from "../src/refresh-flow.mjs";
const ID = "123e4567-e89b-12d3-a456-426614174000";
const BOT = "223e4567-e89b-12d3-a456-426614174001";
const actor = { workspaceId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  userId: "11111111-1111-4111-8111-111111111111" };
const record = { connection_id: ID, version: 1, revoked_at: null,
  refresh_attempt_id: null, notion_workspace_id: ID, notion_bot_id: BOT };
const tokens = { accessToken: "old-access", refreshToken: "old-refresh" };
const vault = { encryptTokens: (pair, binding) => ({ pair, binding }) };
const request = async (_url, options) => {
  assert.equal(JSON.parse(options.body).refresh_token, "old-refresh");
  return { ok: true, status: 200, json: async () => ({
    access_token: "new-access", refresh_token: "new-refresh",
    token_type: "bearer", workspace_id: ID, bot_id: BOT,
  }) };
};
function store() {
  let claimed = false;
  let invalidated = false;
  let written;
  return {
    async claim() { if (claimed || invalidated) return false; claimed = true; return true; },
    async complete(args) {
      if (!claimed || invalidated) return null;
      written = args.encrypted;
      claimed = false;
      return 2;
    },
    async fail() { invalidated = true; claimed = false; return true; },
    state() { return { claimed, invalidated, written }; },
  };
}
function args(overrides = {}) {
  return { actor, record, tokens, vault, store: store(),
    clientId: ID, clientSecret: "secret", request, ...overrides };
}
test("successful refresh stores both new credentials in one server-side call", async () => {
  const db = store();
  const result = await rotateNotionCredentials(args({ store: db }));
  assert.deepEqual(result, { accessToken: "new-access", version: 2 });
  assert.equal(db.state().written.pair.refreshToken, "new-refresh");
  assert.equal(db.state().written.binding.actorUserId, actor.userId);
  assert.equal(db.state().invalidated, false);
});
test("only one of two concurrent requests refreshes the same record", async () => {
  const db = store();
  let providerCalls = 0;
  const slowRequest = async (...input) => {
    providerCalls++;
    await new Promise(resolve => setTimeout(resolve, 20));
    return request(...input);
  };
  const results = await Promise.allSettled([
    rotateNotionCredentials(args({ store: db, request: slowRequest })),
    rotateNotionCredentials(args({ store: db, request: slowRequest })),
  ]);
  assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
  assert.equal(providerCalls, 1);
});
test("ambiguous provider outcome tombstones the claimed attempt", async () => {
  const db = store();
  await assert.rejects(rotateNotionCredentials(args({ store: db,
    request: async () => { throw new Error("secret-bearing error"); },
  })), { code: "REAUTH_REQUIRED" });
  assert.equal(db.state().invalidated, true);
});
test("unconfirmed DB commit also fails closed", async () => {
  const db = store(); db.complete = async () => null;
  await assert.rejects(rotateNotionCredentials(args({ store: db })), {
    code: "REAUTH_REQUIRED",
  });
  assert.equal(db.state().invalidated, true);
});
test("no refresh token or pending attempt prevents provider calls", async () => {
  for (const change of [
    { tokens: { accessToken: "x", refreshToken: null } },
    { record: { ...record, refresh_attempt_id: "busy" } },
  ]) {
    await assert.rejects(rotateNotionCredentials(args({ ...change,
      request: async () => { throw Error("Unexpected provider request"); },
    })), { code: "REAUTH_REQUIRED" });
  }
});
