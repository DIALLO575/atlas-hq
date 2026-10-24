import test from "node:test";
import assert from "node:assert/strict";
import {
  buildNotionAuthorizationUrl, exchangeNotionAuthorizationCode,
  NOTION_OAUTH_CALLBACK_PATH,
} from "../src/oauth.mjs";
const ID = "123e4567-e89b-12d3-a456-426614174000";
const origin = "https://atlas.example";
const redirectUri = origin + NOTION_OAUTH_CALLBACK_PATH;
test("OAuth authorize URL has fixed host, parameters and CSRF state", () => {
  const url = new URL(buildNotionAuthorizationUrl({
    clientId: ID, publicOrigin: origin, redirectUri, state: "some-random-state",
  }));
  assert.equal(url.origin, "https://api.notion.com");
  assert.equal(url.pathname, "/v1/oauth/authorize");
  assert.equal(url.searchParams.get("owner"), "user");
  assert.equal(url.searchParams.get("state"), "some-random-state");
  assert.equal(url.searchParams.get("response_type"), "code");
});
test("rejects attacker-supplied callback and missing state", () => {
  assert.throws(() => buildNotionAuthorizationUrl({ clientId: ID, publicOrigin: origin,
    redirectUri: "https://evil.example/redirect", state: "test" }));
  assert.throws(() => buildNotionAuthorizationUrl({ clientId: ID, publicOrigin: origin,
    redirectUri, state: "" }));
});
test("token exchange uses Basic auth and never returns provider errors", async () => {
  const expected = {
    access_token: "secret-access", refresh_token: "secret-refresh",
    token_type: "bearer", workspace_id: ID, bot_id: ID, workspace_name: "Docs",
  };
  let seen;
  const result = await exchangeNotionAuthorizationCode({
    clientId: ID, clientSecret: "client-secret", code: "authorization-code",
    redirectUri, publicOrigin: origin, request: async (url, opts) => {
      seen = { url, opts }; return { ok: true, status: 200, json: async () => expected };
    },
  });
  assert.equal(seen.url, "https://api.notion.com/v1/oauth/token");
  assert.equal(seen.opts.method, "POST");
  assert.equal(seen.opts.headers.Authorization, "Basic " +
    Buffer.from(ID + ":client-secret").toString("base64"));
  assert.equal(JSON.parse(seen.opts.body).grant_type, "authorization_code");
  assert.equal(result.notionWorkspaceId, ID);
  assert.equal(result.accessToken, "secret-access");
});
test("rejects malformed or provider-denied OAuth replies", async () => {
  await assert.rejects(exchangeNotionAuthorizationCode({
    clientId: ID, clientSecret: "secret", code: "code", redirectUri,
    publicOrigin: origin, request: async () => ({ ok: true, status: 200, json: async () => ({ access_token: "foo" }) }),
  }), { code: "INVALID_RESPONSE" });
  await assert.rejects(exchangeNotionAuthorizationCode({
    clientId: ID, clientSecret: "secret", code: "code", redirectUri,
    publicOrigin: origin, request: async () => ({ ok: false, status: 401 }),
  }), { code: "OAUTH_REJECTED" });
});
