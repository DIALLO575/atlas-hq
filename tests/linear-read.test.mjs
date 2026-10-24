import test from "node:test";
import assert from "node:assert/strict";
import { readLinearResourceRoute, LINEAR_READ_PAGE_SIZE } from "../packages/connectors/linear/src/linear-read.mjs";
import { linearGraphql, LinearApiError } from "../packages/connectors/linear/src/graphql-client.mjs";

const workspaceId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const userId = "11111111-1111-4111-8111-111111111111";
const linearWorkspaceId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const linearActorId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const now = Date.parse("2026-10-24T10:00:00.000Z");

function connection(overrides = {}) {
  return {
    accessToken: "server-only-fixture-token",
    actorUserId: userId,
    linearWorkspaceId,
    linearActorId,
    scopes: ["read"],
    accessExpiresAt: new Date(now + 3_600_000).toISOString(),
    revokedAt: null,
    ...overrides,
  };
}

function teamsData(overrides = {}) {
  return {
    viewer: { id: linearActorId, organization: { id: linearWorkspaceId } },
    teams: { nodes: [{ id: "team-id", key: "ATLAS", name: "Atlas" }], pageInfo: { hasNextPage: false, endCursor: null } },
    ...overrides,
  };
}

function makeRequest(resource = "teams", params = {}) {
  const url = new URL("https://atlas.example/api/apps/linear/read");
  url.searchParams.set("resource", resource);
  url.searchParams.set("workspaceId", workspaceId);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return new Request(url);
}

function deps(overrides = {}) {
  return {
    publicOrigin: "https://atlas.example",
    authorizeWorkspaceMember: async (id) => id === workspaceId ? { workspaceId, userId } : null,
    loadConnection: async () => connection(),
    refreshConnection: async () => ({ status: 200, result: "still-valid" }),
    queryLinear: async () => teamsData(),
    now,
    ...overrides,
  };
}

test("read operations use fixed read-only queries, bounded pages, and expose an incomplete cursor", async () => {
  let call;
  const result = await readLinearResourceRoute(makeRequest("teams", { after: "opaque-cursor-1" }), deps({
    queryLinear: async (args) => { call = args; return teamsData({
      teams: { nodes: [{ id: "team-id", key: "ATLAS", name: "Atlas" }], pageInfo: { hasNextPage: true, endCursor: "opaque-cursor-2" } },
    }); },
  }));
  assert.equal(result.status, 200);
  assert.equal(result.body.incomplete, true);
  assert.deepEqual(result.body.pageInfo, { hasNextPage: true, endCursor: "opaque-cursor-2" });
  assert.equal(call.variables.first, LINEAR_READ_PAGE_SIZE);
  assert.equal(call.variables.after, "opaque-cursor-1");
  assert.equal(call.operationName, "AtlasLinearTeams");
  assert.match(call.query, /teams\(first: \$first, after: \$after\)/);
  assert.doesNotMatch(call.query, /\bmutation\b|\bsubscription\b/);
  assert.equal(JSON.stringify(result).includes("server-only-fixture-token"), false);
});

test("teams, projects and issues are explicit operations with normalized fields", async () => {
  const calls = [];
  const fixtures = {
    teams: { teams: { nodes: [{ id: "team-id", key: "ATLAS", name: "Atlas" }], pageInfo: { hasNextPage: false, endCursor: null } } },
    projects: { projects: { nodes: [{ id: "project-id", name: "Launch", description: "Project", updatedAt: "2026-10-24T09:00:00Z" }], pageInfo: { hasNextPage: false, endCursor: null } } },
    issues: { issues: { nodes: [{ id: "issue-id", identifier: "ATLAS-1", title: "Read API", description: null,
      priority: 2, updatedAt: "2026-10-24T09:00:00Z", team: { id: "team-id", key: "ATLAS", name: "Atlas" },
      project: null, state: { id: "state-id", name: "Todo" }, assignee: null }],
    pageInfo: { hasNextPage: false, endCursor: null } } },
  };
  for (const resource of ["teams", "projects", "issues"]) {
    const result = await readLinearResourceRoute(makeRequest(resource), deps({
      queryLinear: async (args) => { calls.push(args); return teamsData({ [resource]: fixtures[resource][resource] }); },
    }));
    assert.equal(result.status, 200, resource);
    assert.equal(result.body.items.length, 1, resource);
  }
  assert.deepEqual(calls.map((call) => call.operationName), ["AtlasLinearTeams", "AtlasLinearProjects", "AtlasLinearIssues"]);
});

test("request validation rejects unsupported resources, duplicate/oversized cursors, and bad workspaces before I/O", async () => {
  let calls = 0;
  const d = deps({ queryLinear: async () => { calls++; return teamsData(); } });
  assert.equal((await readLinearResourceRoute(makeRequest("mutate"), d)).status, 400);
  assert.equal((await readLinearResourceRoute(makeRequest("teams", { after: "x".repeat(1025) }), d)).status, 400);
  assert.equal((await readLinearResourceRoute(new Request(`https://atlas.example/api/apps/linear/read?resource=teams&workspaceId=${workspaceId}&after=a&after=b`), d)).status, 400);
  assert.equal(calls, 0);
});

test("cross-origin and cross-site GET requests cannot trigger refresh or Linear reads", async () => {
  let calls = 0;
  const shared = deps({
    loadConnection: async () => connection({ accessExpiresAt: new Date(now - 1).toISOString() }),
    refreshConnection: async () => { calls++; return { status: 200, result: "refreshed" }; },
    queryLinear: async () => { calls++; return teamsData(); },
  });
  const wrongOrigin = new Request("https://atlas.example/api/apps/linear/read?resource=teams&workspaceId=" + workspaceId, {
    headers: { origin: "https://evil.example", "sec-fetch-site": "cross-site" },
  });
  assert.equal((await readLinearResourceRoute(wrongOrigin, shared)).status, 403);
  const crossSite = new Request("https://atlas.example/api/apps/linear/read?resource=teams&workspaceId=" + workspaceId, {
    headers: { "sec-fetch-site": "cross-site" },
  });
  assert.equal((await readLinearResourceRoute(crossSite, shared)).status, 403);
  assert.equal(calls, 0);
});

test("missing session, removed membership, actor mismatch and cross-workspace requests never reach Linear", async () => {
  let calls = 0;
  const common = { queryLinear: async () => { calls++; return teamsData(); } };
  assert.equal((await readLinearResourceRoute(makeRequest(), deps({ ...common, authorizeWorkspaceMember: async () => null }))).status, 403);
  assert.equal((await readLinearResourceRoute(makeRequest("teams", { workspaceId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" }), deps(common))).status, 403);
  assert.equal((await readLinearResourceRoute(makeRequest(), deps({ ...common, loadConnection: async () => connection({ actorUserId: "22222222-2222-4222-8222-222222222222" }) }))).status, 404);
  assert.equal(calls, 0);
});

test("expired per-actor connection refreshes server-side and reloads before the read", async () => {
  let current = connection({ accessExpiresAt: new Date(now - 1).toISOString() });
  let loads = 0;
  let refreshes = 0;
  let usedToken;
  const result = await readLinearResourceRoute(makeRequest("teams"), deps({
    loadConnection: async () => { loads++; return current; },
    refreshConnection: async () => {
      refreshes++;
      current = connection({ accessToken: "rotated-server-token", accessExpiresAt: new Date(now + 3_600_000).toISOString() });
      return { status: 200, result: "refreshed" };
    },
    queryLinear: async ({ accessToken }) => { usedToken = accessToken; return teamsData(); },
  }));
  assert.equal(result.status, 200);
  assert.equal(loads, 2);
  assert.equal(refreshes, 1);
  assert.equal(usedToken, "rotated-server-token");
});

test("Linear identity mismatch, malformed data and expired refresh fail closed", async () => {
  const otherOrg = await readLinearResourceRoute(makeRequest(), deps({
    queryLinear: async () => teamsData({ viewer: { id: linearActorId, organization: { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" } } }),
  }));
  assert.equal(otherOrg.status, 403);
  assert.equal(otherOrg.body.error, "linear-workspace-mismatch");
  const otherActor = await readLinearResourceRoute(makeRequest(), deps({
    queryLinear: async () => teamsData({ viewer: { id: userId, organization: { id: linearWorkspaceId } } }),
  }));
  assert.equal(otherActor.status, 403);
  const malformed = await readLinearResourceRoute(makeRequest(), deps({
    queryLinear: async () => teamsData({ teams: { nodes: [], pageInfo: { hasNextPage: true, endCursor: null } } }),
  }));
  assert.equal(malformed.status, 502);
  const noRefresh = await readLinearResourceRoute(makeRequest(), deps({
    loadConnection: async () => connection({ accessExpiresAt: new Date(now - 1).toISOString() }),
    refreshConnection: async () => ({ status: 409, result: "refresh-uncertain" }),
  }));
  assert.equal(noRefresh.status, 409);
  assert.equal(noRefresh.headers["Retry-After"], "3");
});

test("401 and Linear rate limits map to safe statuses without leaking provider details", async () => {
  const unauthorized = await readLinearResourceRoute(makeRequest(), deps({
    queryLinear: async () => { throw new LinearApiError("LINEAR_API_UNAUTHORIZED"); },
  }));
  assert.equal(unauthorized.status, 401);
  const limited = await readLinearResourceRoute(makeRequest(), deps({
    queryLinear: async () => { throw new LinearApiError("LINEAR_API_RATE_LIMITED", { retryAfterSeconds: 19 }); },
  }));
  assert.equal(limited.status, 429);
  assert.equal(limited.headers["Retry-After"], "19");
  assert.deepEqual(limited.body, { error: "linear-rate-limited", retryAfterSeconds: 19 });
});

test("GraphQL transport recognizes Linear RATELIMITED errors in HTTP 400 and honors Retry-After", async () => {
  await assert.rejects(linearGraphql({
    accessToken: "fixture", query: "query Atlas { viewer { id } }", fetchImpl: async () =>
      Response.json({ errors: [{ message: "private provider detail", extensions: { code: "RATELIMITED" } }] }, {
        status: 400, headers: { "Retry-After": "7" },
      }),
  }), (error) => error.code === "LINEAR_API_RATE_LIMITED" && error.retryAfterSeconds === 7 && !error.message.includes("private"));
});

test("malformed GraphQL payloads and upstream errors never expose raw body", async () => {
  await assert.rejects(linearGraphql({
    accessToken: "fixture", query: "query Atlas { viewer { id } }", fetchImpl: async () =>
      new Response("secret provider response", { status: 401 }),
  }), (error) => error.code === "LINEAR_API_UNAUTHORIZED" && !error.message.includes("secret"));
  await assert.rejects(linearGraphql({
    accessToken: "fixture", query: "query Atlas { viewer { id } }", fetchImpl: async () =>
      Response.json({ data: null }),
  }), (error) => error.code === "LINEAR_API_INVALID_RESPONSE");
});
