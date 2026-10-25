import test from "node:test";
import assert from "node:assert/strict";
import { inspect } from "node:util";
import { readMausbotServerSecret } from "../packages/engines/mausbot/src/server-secret.mjs";
import { resolveMausbotConfig, resolveMausbotInstanceConfig, mausbotHealth } from "../packages/engines/mausbot/src/adapter.mjs";
import { mausbotReleasePermission } from "../packages/engine-core/src/release-gates.mjs";

const scope = { workspaceId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", instanceId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" };
function environment() {
  return { ATLAS_MAUSBOT_WORKSPACE_ID: scope.workspaceId, ATLAS_MAUSBOT_INSTANCE_ID: scope.instanceId,
    ATLAS_MAUSBOT_TOKEN: "fixture-only-token-v1", ATLAS_MAUSBOT_TOKEN_VERSION: "env-v1",
    ATLAS_MAUSBOT_URL: "https://maus.example.test/", ATLAS_MAUSBOT_RELEASE_STAGE: "offline" };
}

test("server environment secret cannot cross workspace or instance boundaries", () => {
  const env = environment();
  for (const key of ["workspaceId", "instanceId"]) {
    assert.equal(readMausbotServerSecret(env, { ...scope, [key]: "cccccccc-cccc-4ccc-8ccc-cccccccccccc" }), null);
    assert.equal(readMausbotServerSecret(env, { ...scope, [key]: "invalid" }), null);
  }
  assert.equal(readMausbotServerSecret({ ...env, ATLAS_MAUSBOT_INSTANCE_ID: undefined }, scope), null);
  assert.equal(readMausbotServerSecret({ ...env, ATLAS_MAUSBOT_TOKEN: undefined }, scope), null);
  assert.equal(readMausbotServerSecret({ ...env, NEXT_PUBLIC_ATLAS_MAUSBOT_TOKEN: env.ATLAS_MAUSBOT_TOKEN, ATLAS_MAUSBOT_TOKEN: undefined }, scope), null);
});

test("credentials and resolved configs redact JSON, spread and console inspection", () => {
  const env = environment();
  for (const result of [readMausbotServerSecret(env, scope), resolveMausbotInstanceConfig(env, scope), resolveMausbotConfig(env, scope.workspaceId)]) {
    assert.equal(result.token, env.ATLAS_MAUSBOT_TOKEN); // explicit trusted server access
    for (const output of [JSON.stringify(result), JSON.stringify({ ...result }), inspect(result), inspect(result, { showHidden: true })]) {
      assert.equal(output.includes(env.ATLAS_MAUSBOT_TOKEN), false);
    }
    assert.equal(Object.isFrozen(result), true);
  }
});

test("malformed credential or version fails safely without reflecting the input", () => {
  for (const token of ["a\r\nAuthorization: injected", " token", "token ", "a\tb", "a\u0000b", "a".repeat(4097), 123, {}, "é"]) {
    const env = { ...environment(), ATLAS_MAUSBOT_TOKEN: token };
    for (const resolve of [() => readMausbotServerSecret(env, scope), () => resolveMausbotConfig(env, scope.workspaceId)]) {
      assert.throws(resolve, error => error.code === "MAUSBOT_SERVER_SECRET_INVALID" && error.message === error.code);
    }
  }
  for (const version of [undefined, "", "bad version", "x".repeat(65)]) {
    assert.throws(() => readMausbotServerSecret({ ...environment(), ATLAS_MAUSBOT_TOKEN_VERSION: version }, scope), /MAUSBOT_SERVER_SECRET_INVALID/);
  }
});

test("fresh resolutions observe replacement, removal and revocation with no fallback", () => {
  const env = environment();
  assert.equal(readMausbotServerSecret(env, scope).version, "env-v1");
  env.ATLAS_MAUSBOT_TOKEN = "fixture-only-token-v2";
  env.ATLAS_MAUSBOT_TOKEN_VERSION = "env-v2";
  assert.equal(readMausbotServerSecret(env, scope).token, "fixture-only-token-v2");
  assert.equal(resolveMausbotInstanceConfig(env, scope).credentialVersion, "env-v2");
  env.ATLAS_MAUSBOT_TOKEN_REVOKED = "true";
  assert.equal(resolveMausbotInstanceConfig(env, scope), null);
  assert.equal(resolveMausbotConfig(env, scope.workspaceId), null);
  env.ATLAS_MAUSBOT_TOKEN_REVOKED = "false";
  delete env.ATLAS_MAUSBOT_TOKEN;
  assert.equal(resolveMausbotInstanceConfig(env, scope), null);
  env.ATLAS_MAUSBOT_TOKEN_REVOKED = "yes";
  assert.throws(() => resolveMausbotInstanceConfig(env, scope), /MAUSBOT_SERVER_SECRET_INVALID/);
});

test("instance configuration validates destination and cannot grant release permission", async () => {
  const env = environment();
  const config = resolveMausbotInstanceConfig(env, scope);
  assert.equal(config.canDispatch, false);
  for (const stage of ["offline", "read-only", "enabled"]) {
    for (const mode of ["write", "execute"]) assert.equal(mausbotReleasePermission({ ...env, ATLAS_MAUSBOT_RELEASE_STAGE: stage }, mode).status, 423);
  }
  assert.equal(mausbotReleasePermission(env, "read").status, 423);
  assert.throws(() => resolveMausbotInstanceConfig({ ...env, ATLAS_MAUSBOT_URL: "https://user:password@maus.example.test/" }, scope), /MAUSBOT_URL_INVALID/);
  // An injected fake transport proves the header is usable; no live fetch occurs.
  await mausbotHealth(config, { fetchImpl: async (_url, init) => {
    assert.equal(init.headers.Authorization, `Bearer ${env.ATLAS_MAUSBOT_TOKEN}`);
    return Response.json({ app: "openmausbot" });
  } });
});

test("browser context cannot resolve server credentials", () => {
  globalThis.window = {};
  try {
    assert.throws(() => readMausbotServerSecret(environment(), scope), /MAUSBOT_SERVER_SECRET_INVALID/);
    assert.throws(() => resolveMausbotConfig(environment(), scope.workspaceId), /MAUSBOT_SERVER_SECRET_INVALID/);
  } finally {
    delete globalThis.window;
  }
});
