import test from "node:test";
import assert from "node:assert/strict";
import {
  createNotionOAuthState, readNotionOAuthState, consumeNotionOAuthState,
} from "../src/oauth-state.mjs";
const a = "11111111-1111-4111-8111-111111111111";
const b = "22222222-2222-4222-8222-222222222222";
const workspace = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const key = "not-a-real-secret-" + "a".repeat(32);
function store() {
  const pending = new Map();
  return {
    async insertPendingState(row) { pending.set(row.stateHash, row); },
    async consumePendingState(args) {
      const old = pending.get(args.stateHash);
      if (!old || old.workspaceId !== args.workspaceId || old.userId !== args.userId ||
          Date.parse(old.expiresAt) <= Date.parse(args.now)) return false;
      pending.delete(args.stateHash);
      return true;
    },
  };
}
test("state is random, time-limited and never contains user/workspace IDs", async () => {
  const db = store();
  const s1 = await createNotionOAuthState({ userId: a, workspaceId: workspace, key, store: db, now: 10_000 });
  const s2 = await createNotionOAuthState({ userId: a, workspaceId: workspace, key, store: db, now: 10_000 });
  assert.notEqual(s1, s2);
  assert.equal(s1.includes(a), false);
  assert.ok(readNotionOAuthState({ state: s1, cookieState: s1, key, now: 20_000 }));
  assert.equal(readNotionOAuthState({ state: s1, cookieState: s1, key, now: 911_000 }), null);
});
test("cookie/signature mismatch and actor substitution fail closed", async () => {
  const db = store();
  const state = await createNotionOAuthState({ userId: a, workspaceId: workspace, key, store: db });
  assert.equal(readNotionOAuthState({ state, cookieState: "other", key }), null);
  assert.equal(readNotionOAuthState({ state: state + "x", cookieState: state + "x", key }), null);
  assert.equal(await consumeNotionOAuthState({ state, cookieState: state,
    workspaceId: workspace, userId: b, key, store: db }), null);
  assert.ok(await consumeNotionOAuthState({ state, cookieState: state,
    workspaceId: workspace, userId: a, key, store: db }));
});
test("one-time state withstands concurrent consumption", async () => {
  const db = store();
  const state = await createNotionOAuthState({ userId: a, workspaceId: workspace, key, store: db });
  const run = () => consumeNotionOAuthState({
    state, cookieState: state, workspaceId: workspace, userId: a, key, store: db,
  });
  const res = await Promise.all([run(), run()]);
  assert.equal(res.filter(Boolean).length, 1);
});
test("fails without key and durable pending-state ledger", async () => {
  await assert.rejects(createNotionOAuthState({
    userId: a, workspaceId: workspace, key: "weak", store: store(),
  }), /NOTION_OAUTH_STATE_UNAVAILABLE/);
  assert.equal(await consumeNotionOAuthState({
    state: "fake", cookieState: "fake", workspaceId: workspace, userId: a,
    key, store: null,
  }), null);
});
