import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { consumeLinearOAuthState, createLinearOAuthState } from "../packages/connectors/linear/src/oauth-state.mjs";

const key = "linear-state-test-key-32-bytes-minimum";
const now = Date.parse("2026-10-24T09:00:00.000Z");

function makeAtomicStore() {
  const rows = new Map();
  return {
    rows,
    async insertPendingState(row) { rows.set(row.stateHash, { ...row, consumed: false }); },
    async consumePendingState({ stateHash, workspaceId, userId, now: consumedAt }) {
      const row = rows.get(stateHash);
      if (!row || row.consumed || row.workspaceId !== workspaceId || row.userId !== userId ||
          Date.parse(row.expiresAt) <= Date.parse(consumedAt)) return false;
      // Simulates one atomic conditional UPDATE: mark before yielding to another caller.
      row.consumed = true;
      return true;
    },
  };
}

test("durable state adapter contract permits at most one concurrent consumer", async () => {
  const store = makeAtomicStore();
  const state = await createLinearOAuthState({ workspaceId: "workspace-a", userId: "user-a", key, store, now });
  const attempts = await Promise.all(Array.from({ length: 20 }, () => consumeLinearOAuthState({
    state, cookieState: state, workspaceId: "workspace-a", userId: "user-a", key, store, now,
  })));
  assert.equal(attempts.filter(Boolean).length, 1);
});

test("state consumption rejects expiration, actor mismatch and cross-workspace replay", async () => {
  const store = makeAtomicStore();
  const expiredState = await createLinearOAuthState({ workspaceId: "workspace-a", userId: "user-a", key, store, now });
  assert.equal(await consumeLinearOAuthState({ state: expiredState, cookieState: expiredState,
    workspaceId: "workspace-a", userId: "user-a", key, store, now: now + 16 * 60_000 }), null);
  assert.ok(await consumeLinearOAuthState({ state: expiredState, cookieState: expiredState,
    workspaceId: "workspace-a", userId: "user-b", key, store, now }) === null);
  assert.ok(await consumeLinearOAuthState({ state: expiredState, cookieState: expiredState,
    workspaceId: "workspace-b", userId: "user-a", key, store, now }) === null);
  assert.deepEqual(await consumeLinearOAuthState({ state: expiredState, cookieState: expiredState,
    workspaceId: "workspace-a", userId: "user-a", key, store, now }), {
    workspaceId: "workspace-a", userId: "user-a",
  });
});

test("state migration is server-only and callback fails closed before any token exchange", async () => {
  const migration = await readFile(new URL("../supabase/migrations/20261024093000_atlas_linear_oauth_states.sql", import.meta.url), "utf8");
  const callback = await readFile(new URL("../src/app/api/apps/linear/connect/oauth/route.ts", import.meta.url), "utf8");
  const start = await readFile(new URL("../src/app/api/apps/linear/connect/start/route.ts", import.meta.url), "utf8");
  const connect = await readFile(new URL("../src/lib/linear/connect.ts", import.meta.url), "utf8");
  assert.match(migration, /enable row level security/i);
  assert.match(migration, /revoke all privileges[\s\S]*from public, anon, authenticated/i);
  assert.match(migration, /grant select, insert, update[\s\S]*to service_role/i);
  assert.match(migration, /consumed_at timestamptz/);
  assert.match(callback, /requireLinearWorkspaceAdminForState/);
  assert.match(connect, /\["owner", "admin"\]/);
  assert.match(callback, /linearConnectRedirect\(settings, result\)/);
  assert.doesNotMatch(callback, /redirectTo|returnTo|nextUrl\.searchParams\.get\("redirect/);
  assert.match(callback, /consumeRegisteredLinearOAuthState/);
  assert.match(callback, /callback-disabled/);
  assert.doesNotMatch(callback, /exchangeLinearAuthorizationCode/);
  assert.match(start, /request\.headers\.get\("origin"\)/);
  assert.match(start, /linearAuthorizationUrl/);
  assert.match(start, /httpOnly: true, secure: true, sameSite: "lax"/);
  assert.match(start, /settings\.redirectUri/);
});
