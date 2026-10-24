import test from "node:test";
import assert from "node:assert/strict";
import { revokeNotionOAuthToken } from "../src/oauth.mjs";
const clientId = "123e4567-e89b-12d3-a456-426614174000";
test("revoke uses Notion official endpoint, Basic auth, fixed POST and no-store", async () => {
  let seen;
  await revokeNotionOAuthToken({ clientId, clientSecret: "server-secret", token: "access",
    request: async (url, options) => {
      seen = { url, options };
      return { ok: true, status: 200 };
    } });
  assert.equal(seen.url, "https://api.notion.com/v1/oauth/revoke");
  assert.equal(seen.options.method, "POST");
  assert.equal(JSON.parse(seen.options.body).token, "access");
  assert.equal(seen.options.cache, "no-store");
  assert.equal(seen.options.redirect, "error");
  assert.ok(seen.options.headers.Authorization.startsWith("Basic "));
});
test("failed revoke never includes raw provider response", async () => {
  await assert.rejects(revokeNotionOAuthToken({ clientId,
    clientSecret: "server-secret", token: "access",
    request: async () => ({ ok: false, status: 503, text: async () => "SECRET" }),
  }), error => error.code === "PROVIDER_REVOCATION_UNCONFIRMED" &&
     !error.message.includes("SECRET"));
});
test("malformed credential cannot make a network call", async () => {
  await assert.rejects(revokeNotionOAuthToken({ clientId,
    clientSecret: "server-secret", token: "bad\nheader",
    request: async () => { throw new Error("Unexpected network"); },
  }), { code: "OAUTH_CONFIGURATION_INVALID" });
});
