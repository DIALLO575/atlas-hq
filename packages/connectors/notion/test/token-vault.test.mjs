import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { createNotionTokenVault } from "../src/token-vault.mjs";
const bind = {
  atlasWorkspaceId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  actorUserId: "11111111-1111-4111-8111-111111111111",
  notionWorkspaceId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  notionBotId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
};
function vault() {
  return createNotionTokenVault({
    keys: { v1: randomBytes(32).toString("base64") }, currentKeyId: "v1",
  });
}
test("AES-GCM persists only encrypted tokens and binds each identity", () => {
  const v = vault();
  const row = v.encryptTokens({ accessToken: "notion-secret-access", refreshToken: "notion-secret-refresh" }, bind);
  assert.equal(JSON.stringify(row).includes("notion-secret"), false);
  assert.equal(v.decryptTokens(row, bind).accessToken, "notion-secret-access");
  assert.equal(v.decryptTokens(row, bind).refreshToken, "notion-secret-refresh");
  assert.throws(() => v.decryptTokens(row, { ...bind, actorUserId:
    "22222222-2222-4222-8222-222222222222" }), { code: "AUTHENTICATION_FAILED" });
});
test("optional null refresh and tampered ciphertext fail closed", () => {
  const v = vault();
  const row = v.encryptTokens({ accessToken: "access" }, bind);
  assert.deepEqual(v.decryptTokens(row, bind), { accessToken: "access", refreshToken: null });
  assert.throws(() => v.decryptTokens({ ...row, access_tag: "tampered" }, bind),
    { code: "AUTHENTICATION_FAILED" });
  assert.throws(() => v.decryptTokens({ ...row, refresh_nonce: "incomplete" }, bind),
    { code: "INVALID_CIPHERTEXT" });
});
test("bad keys are rejected", () => {
  assert.throws(() => createNotionTokenVault({
    keys: { x: "unsafe" }, currentKeyId: "x",
  }));
});
