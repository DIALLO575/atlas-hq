import assert from "node:assert/strict";
import test from "node:test";
import { disconnectLinearConnectionRoute, refreshLinearConnectionRoute } from "../packages/connectors/linear/src/connect-routes.mjs";
import { LinearOAuthError, refreshLinearOAuthToken, revokeLinearOAuthTokens } from "../packages/connectors/linear/src/oauth.mjs";

const origin = "https://atlas.example";
const workspaceId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const userId = "11111111-1111-4111-8111-111111111111";
const linearWorkspaceId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const linearActorId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const now = Date.now();
const settings = { publicOrigin: origin, clientId: "fixture-client", clientSecret: "fixture-secret" };
const oldTokens = { accessToken: "old-access-fixture", refreshToken: "old-refresh-fixture" };
const nextTokens = { accessToken: "new-access-fixture", refreshToken: "new-refresh-fixture", expiresInSeconds: 86_400, scopes: ["read"] };

function request(path, workspace = workspaceId, requestOrigin = origin) {
  return new Request(`${origin}/api/apps/linear/connect/${path}`, {
    method: "POST", headers: { origin: requestOrigin, "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ workspaceId: workspace }),
  });
}

function connection(overrides = {}) {
  return {
    ...oldTokens, actorUserId: userId, linearWorkspaceId, linearActorId, scopes: ["read"],
    accessExpiresAt: new Date(now - 1000).toISOString(), version: 1, revokedAt: null,
    refreshAttemptId: null, refreshStartedAt: null,
    ...overrides,
  };
}

function refreshDeps(row, overrides = {}) {
  let providerCalls = 0;
  const effects = [];
  const deps = {
    settings,
    now,
    authorizeWorkspaceAdmin: async (id) => id === workspaceId ? { workspaceId, userId } : null,
    loadConnection: async (actor) => actor.userId === userId && actor.workspaceId === workspaceId ? { ...row } : null,
    claimRefresh: async ({ version, attemptId }) => {
      if (row.version !== version || row.revokedAt || row.refreshAttemptId) return false;
      row.refreshAttemptId = attemptId;
      row.refreshStartedAt = new Date(now).toISOString();
      effects.push("claim");
      return true;
    },
    requestRefresh: async (refreshToken) => {
      assert.equal(refreshToken, oldTokens.refreshToken);
      providerCalls += 1;
      effects.push("provider");
      return nextTokens;
    },
    completeRefresh: async ({ attemptId, version, tokens }) => {
      if (row.version !== version || row.refreshAttemptId !== attemptId || row.revokedAt) return false;
      row.accessToken = tokens.accessToken;
      row.refreshToken = tokens.refreshToken;
      row.accessExpiresAt = new Date(now + tokens.expiresInSeconds * 1000).toISOString();
      row.version += 1;
      row.refreshAttemptId = null;
      row.refreshStartedAt = null;
      effects.push("complete");
      return { version: row.version };
    },
    rejectRefresh: async ({ attemptId, version }) => {
      if (row.version !== version || row.refreshAttemptId !== attemptId) return false;
      row.revokedAt = new Date(now).toISOString();
      row.version += 1;
      row.refreshAttemptId = null;
      row.refreshStartedAt = null;
      effects.push("reject");
      return true;
    },
    invalidateUncertainRefresh: async ({ attemptId, version }) => {
      if (row.revokedAt || !((row.version === version && row.refreshAttemptId === attemptId) ||
          (row.version === version + 1 && !row.refreshAttemptId))) return false;
      row.revokedAt = new Date(now).toISOString();
      row.version += 1;
      row.refreshAttemptId = null;
      row.refreshStartedAt = null;
      effects.push("invalidate");
      return true;
    },
    revokeTokens: async (tokens) => { effects.push(`revoke:${tokens.accessToken}`); return { allRevoked: true }; },
  };
  return { deps: { ...deps, ...overrides }, effects, calls: () => providerCalls };
}

test("refresh API uses the fixed token endpoint, refresh grant and returns only validated fields", async () => {
  let request;
  const result = await refreshLinearOAuthToken({ refreshToken: oldTokens.refreshToken, clientId: "client-id", clientSecret: "secret", fetchImpl: async (url, init) => {
    request = { url, init };
    return Response.json({ access_token: "access-next", refresh_token: "refresh-next", token_type: "Bearer", expires_in: 3600, scope: "read" });
  } });
  assert.equal(request.url, "https://api.linear.app/oauth/token");
  assert.equal(request.init.method, "POST");
  assert.equal(request.init.cache, "no-store");
  const form = new URLSearchParams(request.init.body);
  assert.equal(form.get("grant_type"), "refresh_token");
  assert.equal(form.get("refresh_token"), oldTokens.refreshToken);
  assert.equal(form.get("client_id"), "client-id");
  assert.equal(form.get("client_secret"), "secret");
  assert.deepEqual(result, { accessToken: "access-next", refreshToken: "refresh-next", expiresInSeconds: 3600, scopes: ["read"] });
});

test("refresh maps Linear invalid_grant without leaking its response and keeps other failures ambiguous", async () => {
  await assert.rejects(refreshLinearOAuthToken({ refreshToken: "fixture", clientId: "client", fetchImpl: async () =>
    Response.json({ error: "invalid_grant", error_description: "sensitive provider detail" }, { status: 400 })
  }), (error) => error instanceof LinearOAuthError && error.code === "LINEAR_OAUTH_INVALID_GRANT" && !error.message.includes("sensitive"));
  await assert.rejects(refreshLinearOAuthToken({ refreshToken: "fixture", clientId: "client", fetchImpl: async () =>
    Response.json({ error: "server_error", error_description: "sensitive provider detail" }, { status: 503 })
  }), (error) => error instanceof LinearOAuthError && error.code === "LINEAR_OAUTH_REFRESH_UNCERTAIN" && !error.message.includes("sensitive"));
});

test("Linear revocation sends RFC 7009 token and type hint, and reports only 200 as confirmed", async () => {
  const requests = [];
  const result = await revokeLinearOAuthTokens({ ...oldTokens, fetchImpl: async (url, init) => {
    requests.push({ url, init });
    return new Response(null, { status: requests.length === 1 ? 200 : 400 });
  } });
  assert.deepEqual(result, { accessRevoked: true, refreshRevoked: false, allRevoked: false });
  assert.deepEqual(requests.map(({ url }) => url), ["https://api.linear.app/oauth/revoke", "https://api.linear.app/oauth/revoke"]);
  assert.deepEqual(requests.map(({ init }) => new URLSearchParams(init.body).get("token_type_hint")), ["access_token", "refresh_token"]);
  assert.deepEqual(requests.map(({ init }) => new URLSearchParams(init.body).get("token")), [oldTokens.accessToken, oldTokens.refreshToken]);
});

test("refresh skips valid access tokens and denies members, cross-workspace actors, and bad Origin", async () => {
  const row = connection({ accessExpiresAt: new Date(now + 300_000).toISOString() });
  const fx = refreshDeps(row);
  assert.equal((await refreshLinearConnectionRoute(request("refresh"), fx.deps)).result, "still-valid");
  assert.equal(fx.calls(), 0);
  const member = refreshDeps(connection(), { authorizeWorkspaceAdmin: async () => null });
  assert.equal((await refreshLinearConnectionRoute(request("refresh"), member.deps)).status, 403);
  assert.equal(member.calls(), 0);
  assert.equal((await refreshLinearConnectionRoute(request("refresh", "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"), fx.deps)).status, 403);
  assert.equal((await refreshLinearConnectionRoute(request("refresh", workspaceId, "https://evil.example"), fx.deps)).status, 403);
});

test("expired connection refreshes once and stores only after token response validation", async () => {
  const row = connection();
  const fx = refreshDeps(row);
  const result = await refreshLinearConnectionRoute(request("refresh"), fx.deps);
  assert.deepEqual({ status: result.status, result: result.result }, { status: 200, result: "refreshed" });
  assert.deepEqual(fx.effects, ["claim", "provider", "complete"]);
  assert.equal(fx.calls(), 1);
  assert.equal(row.accessToken, nextTokens.accessToken);
  assert.equal(row.refreshToken, nextTokens.refreshToken);
  assert.equal(row.version, 2);
  assert.equal(row.refreshAttemptId, null);
});

test("durable refresh claim allows only one concurrent worker to call Linear", async () => {
  const row = connection();
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const fx = refreshDeps(row, { requestRefresh: async () => { fxCalls++; await gate; return nextTokens; } });
  let fxCalls = 0;
  const first = refreshLinearConnectionRoute(request("refresh"), fx.deps);
  while (fxCalls === 0) await new Promise((resolve) => setTimeout(resolve, 1));
  const second = await refreshLinearConnectionRoute(request("refresh"), fx.deps);
  assert.equal(second.result, "refresh-in-progress");
  assert.equal(fxCalls, 1);
  release();
  assert.equal((await first).result, "refreshed");
  assert.equal(fxCalls, 1);
});

test("invalid_grant tombstones locally; ambiguous network results retain a non-retryable gate", async () => {
  const invalid = connection();
  const invalidFx = refreshDeps(invalid, { requestRefresh: async () => { throw new LinearOAuthError("LINEAR_OAUTH_INVALID_GRANT"); } });
  const invalidResult = await refreshLinearConnectionRoute(request("refresh"), invalidFx.deps);
  assert.equal(invalidResult.result, "reauth-required");
  assert.ok(invalid.revokedAt);
  assert.deepEqual(invalidFx.effects, ["claim", "reject"]);

  const uncertain = connection();
  const uncertainFx = refreshDeps(uncertain, { requestRefresh: async () => { throw new Error("socket reset"); } });
  assert.equal((await refreshLinearConnectionRoute(request("refresh"), uncertainFx.deps)).result, "refresh-uncertain");
  assert.ok(uncertain.refreshAttemptId);
  uncertain.refreshStartedAt = new Date(now - 6 * 60_000).toISOString();
  assert.equal((await refreshLinearConnectionRoute(request("refresh"), uncertainFx.deps)).result, "refresh-uncertain");
  assert.equal(uncertainFx.calls(), 0);
});

test("uncertain storage completion tombstones the local pair and attempts revocation of the new pair", async () => {
  const row = connection();
  const fx = refreshDeps(row, { completeRefresh: async () => false });
  const result = await refreshLinearConnectionRoute(request("refresh"), fx.deps);
  assert.equal(result.result, "refresh-uncertain");
  assert.equal(result.providerRevocation, "confirmed");
  assert.ok(row.revokedAt);
  assert.equal(row.refreshAttemptId, null);
  assert.ok(fx.effects.includes("invalidate"));
  assert.ok(fx.effects.includes(`revoke:${nextTokens.accessToken}`));
});

test("disconnect disables locally before remote revocation and reports unconfirmed provider state safely", async () => {
  const row = connection();
  const effects = [];
  const result = await disconnectLinearConnectionRoute(request("disconnect"), {
    settings,
    authorizeWorkspaceAdmin: async (id) => id === workspaceId ? { workspaceId, userId } : null,
    loadConnection: async () => row,
    revokeLocal: async ({ version }) => {
      assert.equal(version, row.version);
      row.revokedAt = new Date(now).toISOString();
      effects.push("local-revoke");
      return true;
    },
    revokeTokens: async (tokens) => {
      assert.equal(row.revokedAt !== null, true);
      assert.deepEqual(tokens, oldTokens);
      effects.push("provider-revoke");
      return { allRevoked: false };
    },
  });
  assert.deepEqual({ result: result.result, providerRevocation: result.providerRevocation }, {
    result: "disconnected", providerRevocation: "unconfirmed",
  });
  assert.deepEqual(effects, ["local-revoke", "provider-revoke"]);
  assert.ok(row.revokedAt);
  assert.equal(JSON.stringify(result).includes(oldTokens.refreshToken), false);
});

test("disconnect does not call Linear when local CAS fails and refuses cross-origin requests", async () => {
  let calls = 0;
  const deps = {
    settings,
    authorizeWorkspaceAdmin: async () => ({ workspaceId, userId }),
    loadConnection: async () => connection(),
    revokeLocal: async () => false,
    revokeTokens: async () => { calls++; return { allRevoked: true }; },
  };
  assert.equal((await disconnectLinearConnectionRoute(request("disconnect"), deps)).result, "conflict");
  assert.equal(calls, 0);
  assert.equal((await disconnectLinearConnectionRoute(request("disconnect", workspaceId, "https://evil.example"), deps)).status, 403);
});
