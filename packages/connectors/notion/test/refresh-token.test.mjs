import test from "node:test";
import assert from "node:assert/strict";
import { refreshNotionOAuthToken } from "../src/refresh-token.mjs";
const ID = "123e4567-e89b-12d3-a456-426614174000";
const BOT = "223e4567-e89b-12d3-a456-426614174001";
const base = { clientId: ID, clientSecret: "test-secret", refreshToken: "old-secret",
  notionWorkspaceId: ID, notionBotId: BOT };
test("rotates both tokens via fixed JSON Basic-auth endpoint", async () => {
  let request;
  const result = await refreshNotionOAuthToken({ ...base, request: async (url, options) => {
    request = { url, options };
    return { ok: true, status: 200, json: async () => ({
      access_token: "new-access", refresh_token: "new-refresh",
      workspace_id: ID, bot_id: BOT, token_type: "bearer",
    }) };
  } });
  assert.equal(request.url, "https://api.notion.com/v1/oauth/token");
  assert.equal(request.options.method, "POST");
  assert.equal(request.options.redirect, "error");
  assert.equal(request.options.cache, "no-store");
  assert.equal(request.options.headers["Notion-Version"], "2026-03-11");
  assert.equal(JSON.parse(request.options.body).grant_type, "refresh_token");
  assert.equal(JSON.parse(request.options.body).refresh_token, "old-secret");
  assert.deepEqual(result, { accessToken: "new-access", refreshToken: "new-refresh" });
});
test("rejects mismatched Notion bot or missing rotated refresh token", async () => {
  for (const value of [
    { access_token: "a", refresh_token: "b", bot_id: ID, workspace_id: ID, token_type: "bearer" },
    { access_token: "a", refresh_token: null, bot_id: BOT, workspace_id: ID, token_type: "bearer" },
  ]) {
    await assert.rejects(refreshNotionOAuthToken({ ...base, request: async () => ({
      ok: true, status: 200, json: async () => value,
    }) }), { code: "PROVIDER_RESULT_UNCERTAIN" });
  }
});
test("invalid grant requires reauth; errors never leak provider body", async () => {
  for (const [status, code] of [[400, "REAUTH_REQUIRED"], [401, "REAUTH_REQUIRED"],
    [500, "PROVIDER_RESULT_UNCERTAIN"]]) {
    await assert.rejects(refreshNotionOAuthToken({ ...base, request: async () => ({
      ok: false, status, json: async () => ({ token: "SHOULD_NOT_LEAK" }),
    }) }), error => error.code === code && !error.message.includes("SHOULD_NOT_LEAK"));
  }
});
test("network errors fail closed; malformed refresh input never calls provider", async () => {
  await assert.rejects(refreshNotionOAuthToken({ ...base, request: async () => {
    throw new Error("untrusted stack includes secret");
  } }), { code: "PROVIDER_RESULT_UNCERTAIN" });
  await assert.rejects(refreshNotionOAuthToken({ ...base, refreshToken: "bad\nTOKEN",
    request: async () => { throw Error("should not call"); },
  }), { code: "INVALID_CONFIGURATION" });
});
