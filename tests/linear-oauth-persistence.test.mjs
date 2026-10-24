import test from "node:test";
import assert from "node:assert/strict";
import {
  callbackLinearOAuthRoute, LINEAR_PKCE_COOKIE, LINEAR_STATE_COOKIE,
  startLinearOAuthRoute, verifyLinearStateActor, verifyLinearWorkspaceAdmin,
} from "../packages/connectors/linear/src/connect-routes.mjs";
import { consumeLinearOAuthState, createLinearOAuthState } from "../packages/connectors/linear/src/oauth-state.mjs";

const origin = "https://atlas.example.test";
const callbackUri = `${origin}/api/apps/linear/connect/oauth`;
const key = "linear-state-test-key-32-bytes-minimum";
const now = Date.parse("2026-10-24T09:00:00.000Z");
const workspaceA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const workspaceB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const userA = "11111111-1111-4111-8111-111111111111";
const userB = "22222222-2222-4222-8222-222222222222";
const settings = { publicOrigin: origin, redirectUri: callbackUri, clientId: "linear-client", stateKey: key };

function makeAtomicStore() {
  const rows = new Map();
  return {
    rows,
    async insertPendingState(row) { rows.set(row.stateHash, { ...row, consumedAt: null }); },
    async findPendingState({ stateHash, userId }) {
      const row = rows.get(stateHash);
      return row && row.userId === userId ? row : null;
    },
    async consumePendingState({ stateHash, workspaceId, userId, now: at }) {
      const row = rows.get(stateHash);
      if (!row || row.consumedAt || row.workspaceId !== workspaceId || row.userId !== userId ||
          Date.parse(row.expiresAt) <= Date.parse(at)) return false;
      // Synchronous state transition models the database's conditional UPDATE.
      row.consumedAt = at;
      return true;
    },
  };
}

function makeAdminClient(store) {
  return {
    from() {
      const filters = {};
      const query = {
        select() { return query; },
        eq(name, value) { filters[name] = value; return query; },
        maybeSingle: async () => {
          const row = await store.findPendingState({ stateHash: filters.state_hash, userId: filters.user_id });
          return { data: row ? { workspace_id: row.workspaceId } : null, error: null };
        },
      };
      return query;
    },
  };
}

function makeSessionClient({ user = { id: userA }, role = "admin", membershipWorkspaceId = workspaceA, authError = null } = {}) {
  return {
    auth: { getUser: async () => ({ data: { user }, error: authError }) },
    from() {
      const filters = {};
      const query = {
        select() { return query; },
        eq(name, value) { filters[name] = value; return query; },
        maybeSingle: async () => filters.user_id === user?.id && filters.workspace_id === membershipWorkspaceId
          ? { data: { role }, error: null }
          : { data: null, error: null },
      };
      return query;
    },
  };
}

function startRequest({ workspaceId = workspaceA, requestOrigin = origin } = {}) {
  return new Request(`${origin}/api/apps/linear/connect/start`, {
    method: "POST",
    headers: { origin: requestOrigin, "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ workspaceId }),
  });
}

function callbackRequest({ state, cookieState = state, verifier = "v".repeat(43), query = "code=one-time-code" }) {
  return new Request(`${origin}/api/apps/linear/connect/oauth?${query}&state=${encodeURIComponent(state)}`, {
    headers: { cookie: `${LINEAR_STATE_COOKIE}=${encodeURIComponent(cookieState)}; ${LINEAR_PKCE_COOKIE}=${verifier}` },
  });
}

async function makeFlow({ role = "owner", user = { id: userA }, membershipWorkspaceId = workspaceA } = {}) {
  const store = makeAtomicStore();
  const request = startRequest();
  const started = await startLinearOAuthRoute(request, {
    settings,
    authorizeWorkspaceAdmin: (workspaceId) => verifyLinearWorkspaceAdmin(
      makeSessionClient({ user, role, membershipWorkspaceId }), workspaceId,
    ),
    registerState: ({ workspaceId, userId, stateKey, now: issuedAt }) => createLinearOAuthState({
      workspaceId, userId, key: stateKey, store, now: issuedAt,
    }),
    now,
  });
  const authorizeUrl = new URL(started.location);
  const state = authorizeUrl.searchParams.get("state");
  return { store, started, state, verifierCookie: started.cookies.find((cookie) => cookie.name === LINEAR_PKCE_COOKIE)?.value };
}

function callbackDependencies({ store, session = makeSessionClient(), actorOverride, now: callbackNow = now, exchange = () => assert.fail("exchange must not be called") }) {
  const admin = makeAdminClient(store);
  let consumes = 0;
  return {
    get consumes() { return consumes; },
    exchange,
    dependencies: {
      settings,
      now: callbackNow,
      resolveActorForState: async (stateHash) => actorOverride ?? verifyLinearStateActor({
        client: session, admin, stateHash,
      }),
      consumeState: async ({ state, cookieState, workspaceId, userId, stateKey, now: consumedAt }) => {
        consumes++;
        return consumeLinearOAuthState({
          state, cookieState, workspaceId, userId, key: stateKey, store, now: consumedAt,
        });
      },
    },
  };
}

test("start refuses missing config, bad origin, no session, members and cross-workspace actor", async () => {
  assert.equal((await startLinearOAuthRoute(startRequest(), { settings: null })).error, "LINEAR_NOT_CONFIGURED");
  assert.equal((await startLinearOAuthRoute(startRequest({ requestOrigin: "https://evil.example" }), {
    settings, authorizeWorkspaceAdmin: async () => null,
  })).error, "BAD_ORIGIN");
  const absent = await startLinearOAuthRoute(startRequest(), {
    settings, authorizeWorkspaceAdmin: (workspaceId) => verifyLinearWorkspaceAdmin(
      makeSessionClient({ user: null }), workspaceId),
  });
  assert.equal(absent.status, 403);
  assert.equal(absent.error, "WORKSPACE_FORBIDDEN");
  const member = await startLinearOAuthRoute(startRequest(), {
    settings, authorizeWorkspaceAdmin: (workspaceId) => verifyLinearWorkspaceAdmin(
      makeSessionClient({ role: "member" }), workspaceId),
  });
  assert.equal(member.status, 403);
  const crossWorkspace = await startLinearOAuthRoute(startRequest(), {
    settings, authorizeWorkspaceAdmin: async () => ({ workspaceId: workspaceB, userId: userA }),
  });
  assert.equal(crossWorkspace.error, "WORKSPACE_FORBIDDEN");
});

test("owner and admin start redirect to fixed Linear URI with secure short-lived cookies and PKCE", async () => {
  for (const role of ["owner", "admin"]) {
    const flow = await makeFlow({ role });
    assert.equal(flow.started.status, 303);
    assert.equal(flow.started.kind, "redirect");
    const authorize = new URL(flow.started.location);
    assert.equal(authorize.origin + authorize.pathname, "https://linear.app/oauth/authorize");
    assert.equal(authorize.searchParams.get("redirect_uri"), callbackUri);
    assert.equal(authorize.searchParams.get("code_challenge_method"), "S256");
    assert.equal(authorize.searchParams.get("scope"), "read");
    assert.notEqual(authorize.searchParams.get("code_challenge"), flow.verifierCookie);
    assert.equal(flow.started.cookies.length, 2);
    for (const cookie of flow.started.cookies) {
      assert.equal(cookie.httpOnly, true);
      assert.equal(cookie.secure, true);
      assert.equal(cookie.sameSite, "lax");
      assert.equal(cookie.path, "/api/apps/linear/connect");
      assert.equal(cookie.maxAge, 900);
    }
  }
});

test("callback rejects cookie mismatch, malformed verifier, expired state and absent session", async () => {
  const flow = await makeFlow();
  let resolved = 0;
  const invalidDeps = callbackDependencies({ store: flow.store });
  const originalResolve = invalidDeps.dependencies.resolveActorForState;
  invalidDeps.dependencies.resolveActorForState = async (...args) => { resolved++; return originalResolve(...args); };
  const cookieMismatch = await callbackLinearOAuthRoute(callbackRequest({ state: flow.state, cookieState: "wrong" }), invalidDeps.dependencies);
  assert.match(cookieMismatch.location, /linear=invalid-state/);
  assert.equal(resolved, 0);
  assert.equal(invalidDeps.consumes, 0);
  const badVerifier = await callbackLinearOAuthRoute(callbackRequest({ state: flow.state, verifier: "short" }), invalidDeps.dependencies);
  assert.match(badVerifier.location, /linear=invalid-state/);

  const expired = await callbackLinearOAuthRoute(callbackRequest({ state: flow.state }), {
    ...callbackDependencies({ store: flow.store, now: now + 16 * 60_000 }).dependencies,
  });
  assert.match(expired.location, /linear=invalid-state/);

  const absent = callbackDependencies({ store: flow.store, session: makeSessionClient({ user: null }) });
  const noSession = await callbackLinearOAuthRoute(callbackRequest({ state: flow.state }), absent.dependencies);
  assert.match(noSession.location, /linear=forbidden/);
  assert.equal(absent.consumes, 0);
});

test("callback enforces member role, state actor ownership and workspace binding", async () => {
  const memberFlow = await makeFlow();
  const member = callbackDependencies({ store: memberFlow.store, session: makeSessionClient({ role: "member" }) });
  const memberResult = await callbackLinearOAuthRoute(callbackRequest({ state: memberFlow.state }), member.dependencies);
  assert.match(memberResult.location, /linear=forbidden/);
  assert.equal(member.consumes, 0);

  const wrongActor = callbackDependencies({ store: memberFlow.store, session: makeSessionClient({ user: { id: userB } }) });
  const wrongActorResult = await callbackLinearOAuthRoute(callbackRequest({ state: memberFlow.state }), wrongActor.dependencies);
  assert.match(wrongActorResult.location, /linear=forbidden/);
  assert.equal(wrongActor.consumes, 0);

  const wrongWorkspace = callbackDependencies({
    store: memberFlow.store,
    actorOverride: { workspaceId: workspaceB, userId: userA },
  });
  const workspaceResult = await callbackLinearOAuthRoute(callbackRequest({ state: memberFlow.state }), wrongWorkspace.dependencies);
  assert.match(workspaceResult.location, /linear=invalid-state/);
  assert.equal(wrongWorkspace.consumes, 1);
});

test("callback consumes a valid state once, clears cookies, and never exchanges the code", async () => {
  for (const role of ["owner", "admin"]) {
    const flow = await makeFlow({ role });
    let exchanges = 0;
    const deps = callbackDependencies({ store: flow.store, session: makeSessionClient({ role }), exchange: () => { exchanges++; } });
    const result = await callbackLinearOAuthRoute(callbackRequest({ state: flow.state }), deps.dependencies);
    assert.equal(new URL(result.location).origin, origin);
    assert.equal(new URL(result.location).pathname, "/apps");
    assert.equal(new URL(result.location).searchParams.get("linear"), "callback-disabled");
    assert.equal(result.cookies.length, 2);
    assert.ok(result.cookies.every((cookie) => cookie.value === "" && cookie.maxAge === 0 && cookie.httpOnly && cookie.secure));
    assert.equal(deps.consumes, 1);
    assert.equal(exchanges, 0);

    const replay = await callbackLinearOAuthRoute(callbackRequest({ state: flow.state }), callbackDependencies({ store: flow.store }).dependencies);
    assert.match(replay.location, /linear=invalid-state/);
  }
});

test("concurrent callbacks have exactly one database-store consumer", async () => {
  const flow = await makeFlow();
  const first = callbackLinearOAuthRoute(callbackRequest({ state: flow.state }), callbackDependencies({ store: flow.store }).dependencies);
  const second = callbackLinearOAuthRoute(callbackRequest({ state: flow.state }), callbackDependencies({ store: flow.store }).dependencies);
  const results = await Promise.all([first, second]);
  assert.equal(results.filter((result) => new URL(result.location).searchParams.get("linear") === "callback-disabled").length, 1);
  assert.equal(results.filter((result) => new URL(result.location).searchParams.get("linear") === "invalid-state").length, 1);
});

test("enabled callback saves only after identity verification and returns a fixed outcome", async () => {
  const flow = await makeFlow();
  const deps = callbackDependencies({ store: flow.store });
  let exchanged = 0;
  let verified = 0;
  let saved;
  const result = await callbackLinearOAuthRoute(callbackRequest({ state: flow.state, verifier: flow.verifierCookie }), {
    ...deps.dependencies,
    callbackEnabled: true,
    prepareConnectionStore: async () => {},
    revokeTokens: async () => {},
    exchangeCode: async (args) => {
      exchanged++;
      assert.equal(args.code, "one-time-code");
      assert.equal(args.codeVerifier, flow.verifierCookie);
      return { accessToken: "test-access", refreshToken: "test-refresh", expiresInSeconds: 3600, scopes: ["read"] };
    },
    verifyLinearIdentity: async (accessToken) => {
      verified++;
      assert.equal(accessToken, "test-access");
      return { userId: userA, workspaceId: workspaceB };
    },
    saveConnection: async (record) => { saved = record; },
  });
  assert.equal(new URL(result.location).searchParams.get("linear"), "connected");
  assert.equal(exchanged, 1);
  assert.equal(verified, 1);
  assert.equal(saved.actor.userId, userA);
  assert.equal(saved.actor.workspaceId, workspaceA);
  assert.equal(saved.linearIdentity.workspaceId, workspaceB);
  assert.equal(saved.scopes.join(","), "read");
  assert.ok(Date.parse(saved.expiresAt) > now);
  assert.equal(result.headers["Cache-Control"], "private, no-store");
});

test("callback refuses broad scopes or maps identity/storage failures to a safe result", async () => {
  const flow = await makeFlow();
  const base = callbackDependencies({ store: flow.store }).dependencies;
  let verified = 0;
  let revoked = 0;
  const scopeMismatch = await callbackLinearOAuthRoute(callbackRequest({ state: flow.state, verifier: flow.verifierCookie }), {
    ...base, callbackEnabled: true, prepareConnectionStore: async () => {}, revokeTokens: async () => { revoked++; },
    exchangeCode: async () => ({ accessToken: "secret", refreshToken: "secret", expiresInSeconds: 3600, scopes: ["read", "write"] }),
    verifyLinearIdentity: async () => { verified++; return { userId: userA, workspaceId: workspaceA }; },
    saveConnection: async () => assert.fail("must not persist unapproved scopes"),
  });
  assert.equal(new URL(scopeMismatch.location).searchParams.get("linear"), "unavailable");
  assert.equal(verified, 0);
  assert.equal(revoked, 1);

  const nextFlow = await makeFlow();
  const storageFailure = await callbackLinearOAuthRoute(callbackRequest({ state: nextFlow.state, verifier: nextFlow.verifierCookie }), {
    ...callbackDependencies({ store: nextFlow.store }).dependencies,
    callbackEnabled: true, prepareConnectionStore: async () => {},
    exchangeCode: async () => ({ accessToken: "secret", refreshToken: "secret", expiresInSeconds: 3600, scopes: ["read"] }),
    verifyLinearIdentity: async () => ({ userId: userA, workspaceId: workspaceA }),
    saveConnection: async () => { throw new Error("database response with secret"); },
    revokeTokens: async (tokens) => { assert.equal(tokens.accessToken, "secret"); },
  });
  assert.equal(new URL(storageFailure.location).searchParams.get("linear"), "unavailable");
  assert.doesNotMatch(storageFailure.location, /secret|database/);
});


test("callback checks the persistent table before code exchange and does not exchange when it is unavailable", async () => {
  const flow = await makeFlow();
  let exchanged = 0;
  const result = await callbackLinearOAuthRoute(callbackRequest({ state: flow.state, verifier: flow.verifierCookie }), {
    ...callbackDependencies({ store: flow.store }).dependencies,
    callbackEnabled: true,
    prepareConnectionStore: async () => { throw new Error("table missing"); },
    exchangeCode: async () => { exchanged++; throw new Error("must not exchange"); },
    verifyLinearIdentity: async () => assert.fail("identity must not be queried"),
    saveConnection: async () => assert.fail("must not save"),
    revokeTokens: async () => {},
  });
  assert.equal(new URL(result.location).searchParams.get("linear"), "unavailable");
  assert.equal(exchanged, 0);
});
