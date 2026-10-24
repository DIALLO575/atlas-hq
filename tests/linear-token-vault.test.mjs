import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { createLinearTokenVault, linearTokenVaultFromEnvironment } from "../packages/connectors/linear/src/token-vault.mjs";
import { revokeLinearOAuthTokens } from "../packages/connectors/linear/src/oauth.mjs";
import { loadLinearConnectionForActor, rotateLinearConnectionKey, saveLinearConnection } from "../packages/connectors/linear/src/connection-store.mjs";
import { verifyLinearOAuthIdentity } from "../packages/connectors/linear/src/linear-identity.mjs";

const atlasWorkspaceId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const otherWorkspaceId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const actorUserId = "11111111-1111-4111-8111-111111111111";
const otherActorId = "22222222-2222-4222-8222-222222222222";
const linearWorkspaceId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const linearActorId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const binding = { atlasWorkspaceId, actorUserId, linearWorkspaceId, linearActorId };
const tokenPair = { accessToken: "lin_access_fixture", refreshToken: "lin_refresh_fixture" };
const keyA = randomBytes(32).toString("base64");
const keyB = randomBytes(32).toString("base64");
const vault = createLinearTokenVault({ keys: { v1: keyA, v2: keyB }, currentKeyId: "v1" });

test("AES-256-GCM roundtrips both tokens and stores only ciphertext with independent nonces", () => {
  const encrypted = vault.encryptTokens(tokenPair, binding);
  assert.notEqual(encrypted.access_ciphertext, tokenPair.accessToken);
  assert.notEqual(encrypted.refresh_ciphertext, tokenPair.refreshToken);
  assert.notEqual(encrypted.access_nonce, encrypted.refresh_nonce);
  assert.deepEqual(vault.decryptTokens(encrypted, binding), tokenPair);
});

test("vault rejects missing, malformed and wrong-version keys without fallback", () => {
  assert.throws(() => linearTokenVaultFromEnvironment({}), /LINEAR_TOKEN_VAULT_UNAVAILABLE/);
  assert.throws(() => createLinearTokenVault({ keys: { v1: "short" }, currentKeyId: "v1" }));
  assert.throws(() => createLinearTokenVault({ keys: { v1: keyA }, currentKeyId: "v2" }));
  const oldEnvelope = vault.encryptTokens(tokenPair, binding);
  const onlyNew = createLinearTokenVault({ keys: { v2: keyB }, currentKeyId: "v2" });
  assert.throws(() => onlyNew.decryptTokens(oldEnvelope, binding), /LINEAR_TOKEN_KEY_UNAVAILABLE/);
});

test("GCM detects tampering and AAD prevents cross-actor and cross-workspace decrypts", () => {
  const envelope = vault.encryptTokens(tokenPair, binding);
  const changed = `${envelope.access_ciphertext[0] === "A" ? "B" : "A"}${envelope.access_ciphertext.slice(1)}`;
  assert.throws(() => vault.decryptTokens({ ...envelope, access_ciphertext: changed }, binding));
  assert.throws(() => vault.decryptTokens(envelope, { ...binding, actorUserId: otherActorId }));
  assert.throws(() => vault.decryptTokens(envelope, { ...binding, atlasWorkspaceId: otherWorkspaceId }));
  assert.throws(() => vault.decryptTokens(envelope, { ...binding, linearWorkspaceId: otherWorkspaceId }));
  assert.throws(() => vault.decryptTokens(envelope, { ...binding, linearActorId: otherActorId }));
});

test("key rotation decrypts under the old version and re-encrypts under the current version", () => {
  const old = vault.encryptTokens(tokenPair, binding);
  const rotatedVault = createLinearTokenVault({ keys: { v1: keyA, v2: keyB }, currentKeyId: "v2" });
  const clear = rotatedVault.decryptTokens(old, binding);
  const rotated = rotatedVault.encryptTokens(clear, binding);
  assert.equal(rotated.token_key_id, "v2");
  assert.deepEqual(rotatedVault.decryptTokens(rotated, binding), tokenPair);
  assert.notEqual(rotated.access_ciphertext, old.access_ciphertext);
});

function fakeAdmin({ existing = null, failRpc = false } = {}) {
  let row = existing;
  return {
    get row() { return row; },
    from() {
      const filters = {};
      const query = {
        select() { return query; },
        eq(name, value) { filters[name] = value; return query; },
        maybeSingle: async () => ({ data: row && row.workspace_id === filters.workspace_id && row.user_id === filters.user_id ? row : null, error: null }),
        is() { return query; },
        gt() { return query; },
      };
      return query;
    },
    async rpc(name, args) {
      if (failRpc) return { data: null, error: new Error("private db detail") };
      if (name !== "atlas_linear_save_connection") return { data: false, error: null };
      const expected = args.p_expected_version;
      if (row ? row.version !== expected : expected !== null) return { data: null, error: null };
      row = {
        ...args, workspace_id: args.p_workspace_id, user_id: args.p_user_id,
        linear_workspace_id: args.p_linear_workspace_id, linear_actor_id: args.p_linear_actor_id,
        token_key_id: args.p_token_key_id, access_nonce: args.p_access_nonce,
        access_ciphertext: args.p_access_ciphertext, access_tag: args.p_access_tag,
        refresh_nonce: args.p_refresh_nonce, refresh_ciphertext: args.p_refresh_ciphertext,
        refresh_tag: args.p_refresh_tag, scopes: args.p_scopes,
        access_expires_at: args.p_access_expires_at, version: (row?.version ?? 0) + 1, revoked_at: null,
      };
      return { data: row.version, error: null };
    },
  };
}

function session(userId = actorUserId, role = "admin") {
  return {
    auth: { getUser: async () => ({ data: { user: { id: userId } }, error: null }) },
    from() {
      const filters = {};
      const query = {
        select() { return query; },
        eq(name, value) { filters[name] = value; return query; },
        maybeSingle: async () => filters.user_id === userId && filters.workspace_id === atlasWorkspaceId
          ? { data: { role }, error: null } : { data: null, error: null },
      };
      return query;
    },
  };
}

test("connection store binds one actor and workspace, uses version CAS, and denies members/cross-tenant reads", async () => {
  const admin = fakeAdmin();
  const input = {
    actor: { workspaceId: atlasWorkspaceId, userId: actorUserId },
    linearIdentity: { workspaceId: linearWorkspaceId, userId: linearActorId },
    tokens: tokenPair, scopes: ["read"], expiresAt: new Date(Date.now() + 86_400_000).toISOString(), vault,
  };
  assert.deepEqual(await saveLinearConnection(admin, input), { version: 1 });
  const loaded = await loadLinearConnectionForActor({ session: session(), admin, workspaceId: atlasWorkspaceId, vault });
  assert.deepEqual({ accessToken: loaded.accessToken, refreshToken: loaded.refreshToken }, tokenPair);
  assert.equal(loaded.linearWorkspaceId, linearWorkspaceId);
  assert.equal(await loadLinearConnectionForActor({ session: session(actorUserId, "member"), admin, workspaceId: atlasWorkspaceId, vault }), null);
  const memberRead = await loadLinearConnectionForActor({
    session: session(actorUserId, "member"), admin, workspaceId: atlasWorkspaceId, vault, allowMemberRead: true,
  });
  assert.deepEqual({ accessToken: memberRead.accessToken, refreshToken: memberRead.refreshToken }, tokenPair);
  assert.equal(await loadLinearConnectionForActor({ session: session(), admin, workspaceId: otherWorkspaceId, vault }), null);
  assert.equal(await loadLinearConnectionForActor({ session: session(otherActorId), admin, workspaceId: atlasWorkspaceId, vault }), null);
  await assert.rejects(saveLinearConnection(admin, { ...input, scopes: ["read", "write"] }), /LINEAR_CONNECTION_INVALID/);
});

test("connection store maps storage errors to a safe error and never returns provider data", async () => {
  const admin = fakeAdmin({ failRpc: true });
  await assert.rejects(saveLinearConnection(admin, {
    actor: { workspaceId: atlasWorkspaceId, userId: actorUserId },
    linearIdentity: { workspaceId: linearWorkspaceId, userId: linearActorId },
    tokens: tokenPair, scopes: ["read"], expiresAt: new Date(Date.now() + 86_400_000).toISOString(), vault,
  }), (error) => error.message === "LINEAR_CONNECTION_STORE_UNAVAILABLE" && !error.message.includes("private db detail"));
});

test("connection replacement is versioned so stale rotation callers cannot overwrite each other", async () => {
  const initial = fakeAdmin();
  const input = {
    actor: { workspaceId: atlasWorkspaceId, userId: actorUserId },
    linearIdentity: { workspaceId: linearWorkspaceId, userId: linearActorId },
    tokens: tokenPair, scopes: ["read"], expiresAt: new Date(Date.now() + 86_400_000).toISOString(), vault,
  };
  await saveLinearConnection(initial, input);
  const left = await saveLinearConnection(initial, { ...input, tokens: { accessToken: "rotated-a", refreshToken: "refresh-a" } });
  const staleAdmin = {
    ...initial,
    from: () => ({ select() { return this; }, eq() { return this; }, async maybeSingle() {
      return { data: { version: 1 }, error: null };
    } }),
    rpc: async () => ({ data: null, error: null }),
  };
  assert.equal(left.version, 2);
  await assert.rejects(saveLinearConnection(staleAdmin, input), /LINEAR_CONNECTION_STORE_UNAVAILABLE/);
});

test("Linear identity verifier uses fixed GraphQL viewer plus organization query and validates UUIDs", async () => {
  let request;
  const result = await verifyLinearOAuthIdentity("access-fixture", async (url, init) => {
    request = { url, init };
    return Response.json({ data: { viewer: { id: linearActorId, organization: { id: linearWorkspaceId } } } });
  });
  assert.equal(request.url, "https://api.linear.app/graphql");
  assert.equal(request.init.headers.authorization, "Bearer access-fixture");
  assert.match(JSON.parse(request.init.body).query, /viewer\s*\{\s*id\s+organization\s*\{\s*id/);
  assert.deepEqual(result, { userId: linearActorId, workspaceId: linearWorkspaceId });
  await assert.rejects(verifyLinearOAuthIdentity("x", async () => Response.json({ data: { viewer: { id: linearActorId } } })));
});


test("token revocation uses only the fixed Linear endpoint and form bodies", async () => {
  const requests = [];
  await revokeLinearOAuthTokens({ accessToken: "access-fixture", refreshToken: "refresh-fixture", fetchImpl: async (url, init) => {
    requests.push({ url, init });
    return new Response(null, { status: 200 });
  } });
  assert.equal(requests.length, 2);
  for (const request of requests) {
    assert.equal(request.url, "https://api.linear.app/oauth/revoke");
    assert.equal(request.init.method, "POST");
    assert.equal(request.init.headers["content-type"], "application/x-www-form-urlencoded");
  }
  assert.deepEqual(requests.map(({ init }) => new URLSearchParams(init.body).get("token")), ["access-fixture", "refresh-fixture"]);
});


test("connection key rotation uses the current key and the version read before decrypt", async () => {
  const admin = fakeAdmin();
  const oldVault = createLinearTokenVault({ keys: { v1: keyA, v2: keyB }, currentKeyId: "v1" });
  const newVault = createLinearTokenVault({ keys: { v1: keyA, v2: keyB }, currentKeyId: "v2" });
  await saveLinearConnection(admin, {
    actor: { workspaceId: atlasWorkspaceId, userId: actorUserId },
    linearIdentity: { workspaceId: linearWorkspaceId, userId: linearActorId },
    tokens: tokenPair, scopes: ["read"], expiresAt: new Date(Date.now() + 86_400_000).toISOString(), vault: oldVault,
  });
  const rotated = await rotateLinearConnectionKey(admin, { workspaceId: atlasWorkspaceId, userId: actorUserId, vault: newVault });
  assert.deepEqual(rotated, { rotated: true, version: 2 });
  assert.equal(admin.row.token_key_id, "v2");
  assert.deepEqual(newVault.decryptTokens(admin.row, binding), tokenPair);
});
