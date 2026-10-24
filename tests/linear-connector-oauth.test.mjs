import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  createLinearPkcePair,
  exchangeLinearAuthorizationCode,
  linearAuthorizationUrl,
  LinearOAuthError,
} from "../packages/connectors/linear/src/oauth.mjs";
import { linearGraphql, LinearApiError } from "../packages/connectors/linear/src/graphql-client.mjs";
import { authorizeLinearWorkspaceAccess, canManageLinearConnection } from "../packages/connectors/linear/src/workspace-access.mjs";
import { linearCapabilityScopes, linearMvpContract } from "../packages/connectors/linear/src/contract.ts";
import { consumeLinearOAuthState, createLinearOAuthState } from "../packages/connectors/linear/src/oauth-state.mjs";

const redirectUri = "https://atlas.example.test/api/apps/linear/connect/oauth";
const state = "A".repeat(43);

test("Linear OAuth uses PKCE S256 and only requests the explicit least-privilege scope", () => {
  const { verifier, challenge } = createLinearPkcePair();
  assert.equal(challenge, createHash("sha256").update(verifier).digest("base64url"));
  const url = linearAuthorizationUrl({ clientId: "client-id", redirectUri, state, codeChallenge: challenge });
  assert.equal(url.origin + url.pathname, "https://linear.app/oauth/authorize");
  assert.equal(url.searchParams.get("response_type"), "code");
  assert.equal(url.searchParams.get("scope"), "read");
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  assert.equal(url.searchParams.get("state"), state);
  assert.equal(url.searchParams.get("actor"), "user");
  assert.equal(url.searchParams.has("client_secret"), false);
});

test("OAuth rejects unapproved scopes and insecure redirect URIs", () => {
  const { challenge } = createLinearPkcePair();
  assert.throws(() => linearAuthorizationUrl({ clientId: "x", redirectUri, state, codeChallenge: challenge, scopes: ["read", "admin"] }), LinearOAuthError);
  assert.throws(() => linearAuthorizationUrl({ clientId: "x", redirectUri: "http://evil.test/callback", state, codeChallenge: challenge }), LinearOAuthError);
});

test("OAuth state is actor/workspace-bound, expiring, cookie-bound, and consumed once", async () => {
  let pending;
  const store = {
    async insertPendingState(record) { pending = record; },
    async consumePendingState(record) {
      if (!pending || pending.stateHash !== record.stateHash || pending.workspaceId !== record.workspaceId ||
          pending.userId !== record.userId || Date.parse(pending.expiresAt) <= Date.parse(record.now)) return false;
      pending = null;
      return true;
    },
  };
  const now = Date.parse("2026-10-24T08:00:00.000Z");
  const stateKey = "k".repeat(32);
  const state = await createLinearOAuthState({ workspaceId: "atlas-a", userId: "user-a", key: stateKey, store, now });
  assert.equal(typeof pending.stateHash, "string");
  assert.equal(state.includes("user-a"), false);
  assert.deepEqual(await consumeLinearOAuthState({ state, cookieState: state, workspaceId: "atlas-a", userId: "user-a", key: stateKey, store, now }), { workspaceId: "atlas-a", userId: "user-a" });
  assert.equal(await consumeLinearOAuthState({ state, cookieState: state, workspaceId: "atlas-a", userId: "user-a", key: stateKey, store, now }), null);
  assert.equal(await consumeLinearOAuthState({ state, cookieState: state, workspaceId: "atlas-b", userId: "user-a", key: stateKey, store, now }), null);

  const expired = await createLinearOAuthState({ workspaceId: "atlas-a", userId: "user-a", key: stateKey, store, now });
  assert.equal(await consumeLinearOAuthState({ state: expired, cookieState: expired, workspaceId: "atlas-a", userId: "user-a", key: stateKey, store, now: now + 16 * 60_000 }), null);
});

test("OAuth code exchange sends credentials only to the server token endpoint", async () => {
  let request;
  const token = { access_token: "access-secret", refresh_token: "refresh-secret", token_type: "Bearer", expires_in: 86400, scope: "read issues:create" };
  const result = await exchangeLinearAuthorizationCode({
    code: "one-time-code", clientId: "client-id", clientSecret: "client-secret", redirectUri,
    codeVerifier: "v".repeat(43), fetchImpl: async (url, init) => {
      request = { url, init };
      return Response.json(token);
    },
  });
  assert.equal(request.url, "https://api.linear.app/oauth/token");
  assert.equal(request.init.method, "POST");
  assert.equal(request.init.headers["content-type"], "application/x-www-form-urlencoded");
  assert.equal(request.init.cache, "no-store");
  const form = new URLSearchParams(request.init.body);
  assert.equal(form.get("client_secret"), "client-secret");
  assert.equal(form.get("code_verifier"), "v".repeat(43));
  assert.deepEqual(result, { accessToken: "access-secret", refreshToken: "refresh-secret", expiresInSeconds: 86400, scopes: ["read", "issues:create"] });
});

test("OAuth provider errors never expose response bodies", async () => {
  await assert.rejects(
    exchangeLinearAuthorizationCode({ code: "x", clientId: "id", redirectUri, codeVerifier: "v".repeat(43), fetchImpl: async () => new Response("client_secret leaked", { status: 401 }) }),
    (error) => error instanceof LinearOAuthError && error.code === "LINEAR_OAUTH_REJECTED" && !error.message.includes("leaked"),
  );
});

test("Linear GraphQL client keeps bearer auth server-side and maps errors safely", async () => {
  let request;
  const result = await linearGraphql({ accessToken: "server-token", query: "query { viewer { id } }", fetchImpl: async (url, init) => {
    request = { url, init };
    return Response.json({ data: { viewer: { id: "viewer-1" } } });
  } });
  assert.equal(request.url, "https://api.linear.app/graphql");
  assert.equal(request.init.headers.authorization, "Bearer server-token");
  assert.equal(request.init.cache, "no-store");
  assert.deepEqual(result, { viewer: { id: "viewer-1" } });
  await assert.rejects(linearGraphql({ accessToken: "t", query: "query { viewer { id } }", fetchImpl: async () => new Response("private", { status: 403 }) }),
    (error) => error instanceof LinearApiError && error.code === "LINEAR_API_FORBIDDEN" && !error.message.includes("private"));
});

test("Linear GraphQL rejects every non-query operation before transport", async () => {
  let requests = 0;
  const fetchImpl = async () => { requests++; return Response.json({ data: {} }); };
  const denied = (query, operationName) => assert.rejects(
    linearGraphql({ accessToken: "server-token", query, operationName, fetchImpl }),
    (error) => error instanceof LinearApiError && error.code === "LINEAR_API_INVALID_REQUEST",
  );

  await denied("mutation { issueCreate(input: {}) { success } }");
  await denied("mutation { safeAlias: issueCreate(input: {}) { success } }");
  await denied("query Read { viewer { id } } mutation Write { issueCreate(input: {}) { success } }", "Read");
  await denied("subscription Watch { issue { id } }");
  assert.equal(requests, 0);
});

test("Linear GraphQL resolves multiple read operations explicitly and ignores comments and string content", async () => {
  let request;
  const query = `# mutation { ignored }
    query First { viewer { id } }
    query Second {
      search(term: "mutation subscription { ignored }") { nodes { id } }
      teams(filter: """mutation subscription { ignored }""") { nodes { id } }
    }
  `;
  const result = await linearGraphql({
    accessToken: "server-token", query, operationName: "Second",
    fetchImpl: async (_url, init) => { request = JSON.parse(init.body); return Response.json({ data: { search: { nodes: [] } } }); },
  });
  assert.equal(request.operationName, "Second");
  assert.deepEqual(result, { search: { nodes: [] } });
});

test("Linear GraphQL rejects ambiguous or unresolved multi-operation documents before transport", async () => {
  let requests = 0;
  const fetchImpl = async () => { requests++; return Response.json({ data: {} }); };
  const query = "query First { viewer { id } } query Second { viewer { id } }";
  for (const operationName of [undefined, "Missing"]) {
    await assert.rejects(linearGraphql({ accessToken: "t", query, operationName, fetchImpl }),
      (error) => error instanceof LinearApiError && error.code === "LINEAR_API_INVALID_REQUEST");
  }
  assert.equal(requests, 0);
});

test("ATLAS workspace membership and exact Linear workspace binding fail closed", () => {
  const base = { actorUserId: "user-a", memberUserId: "user-a", memberRole: "member", requestedWorkspaceId: "atlas-a", linkedWorkspaceId: "atlas-a" };
  assert.equal(authorizeLinearWorkspaceAccess(base), true);
  assert.equal(authorizeLinearWorkspaceAccess({ ...base, memberUserId: "user-b" }), false);
  assert.equal(authorizeLinearWorkspaceAccess({ ...base, memberRole: "guest" }), false);
  assert.equal(authorizeLinearWorkspaceAccess({ ...base, linkedWorkspaceId: "atlas-b" }), false);
  assert.equal(canManageLinearConnection("member"), false);
  assert.equal(canManageLinearConnection("admin"), true);
});

test("Linear capability registry excludes broad write and admin scopes", () => {
  assert.deepEqual(linearCapabilityScopes["issues.read"], ["read"]);
  assert.deepEqual(linearCapabilityScopes["issues.create"], ["issues:create"]);
  assert.equal(linearMvpContract.writesEnabled, false);
  assert.equal(linearMvpContract.supportedScopes.includes("write"), false);
  assert.equal(linearMvpContract.supportedScopes.includes("admin"), false);
});
