import assert from "node:assert/strict";
import test from "node:test";
import { generateKeyPairSync } from "node:crypto";
import { verifyCreatedRepositoryAccess } from "../packages/connectors/github/src/github-studio-grant-verifier.mjs";

const { privateKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" },
});
const workspaceId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const binding = {
  workspaceId, installationId: 77, status: "repositories-ready",
  repositorySelection: "selected", ownershipVerifiedAt: "2026-10-24T00:00:00Z",
  repositoriesVerifiedAt: "2026-10-24T00:00:00Z",
};
const created = { repositoryId: 91, fullName: "octocat/studio-test",
  url: "https://github.com/octocat/studio-test" };
const now = () => Date.parse("2026-10-24T22:00:00Z");
const body = (obj, status = 200) => new Response(JSON.stringify(obj), { status });
function makeMock(opts = {}) {
  const calls = [];
  async function request(url, init) {
    calls.push({ url, init });
    if (url.endsWith("/app/installations/77")) {
      return body({ id: 77, target_type: opts.targetType ?? "User",
        account: { login: opts.login ?? "octocat" },
        suspended_at: opts.suspended ? "2026-10-24T22:00:00Z" : null,
        repository_selection: opts.selection ?? "selected",
        permissions: { repository_creation: opts.permission ?? "write" },
      });
    }
    if (url.endsWith("/access_tokens")) {
      assert.deepEqual(JSON.parse(init.body),
        { repository_ids: [91], permissions: {} });
      return body({ token: "mock-scoped-token",
        expires_at: opts.expiry ?? "2026-10-24T23:00:00Z",
        repositories: [{ id: opts.tokenRepoId ?? 91 }] }, opts.tokenStatus ?? 201);
    }
    assert.equal(url, "https://api.github.com/installation/repositories?per_page=100");
    assert.equal(init.headers.Authorization, "Bearer mock-scoped-token");
    return body({ total_count: 1, repositories: [{
      id: opts.listRepoId ?? 91,
      full_name: opts.fullName ?? "octocat/studio-test",
      owner: { login: opts.listOwner ?? "octocat" },
      html_url: opts.url ?? created.url,
    }] }, opts.listStatus ?? 200);
  }
  return { calls, request };
}
const args = (request, overrides = {}) => ({
  workspaceId, installationId: 77, binding, created,
  appId: "1234", privateKey, now, request, ...overrides,
});

test("checks a fresh personal installation, scoped token and numeric repo grant", async () => {
  const mock = makeMock();
  assert.equal(await verifyCreatedRepositoryAccess(args(mock.request)), true);
  assert.equal(mock.calls.length, 3);
  assert.equal(mock.calls[0].init.method, "GET");
  assert.equal(mock.calls[1].init.method, "POST");
  assert.equal(mock.calls[2].init.method, "GET");
  for (const c of mock.calls) {
    assert.equal(c.init.cache, "no-store");
    assert.equal(c.init.redirect, "error");
  }
});

test("rejects stale, revoked and cross-tenant bindings without contacting GitHub", async () => {
  for (const override of [
    { workspaceId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" },
    { installationId: 78 },
    { binding: { ...binding, status: "revoked" } },
    { binding: { ...binding, repositoriesVerifiedAt: null } },
    { created: { ...created, repositoryId: -1 } },
  ]) {
    const mock = makeMock();
    await assert.rejects(verifyCreatedRepositoryAccess(args(mock.request, override)),
      (e) => e.code === "PERMISSION_DENIED");
    assert.equal(mock.calls.length, 0);
  }
});

test("an installation without current ownership, permission or grant fails closed", async () => {
  for (const config of [
    { targetType: "Organization" }, { login: "victim" },
    { suspended: true }, { permission: "read" }, { selection: "all" },
  ]) {
    const mock = makeMock(config);
    assert.equal(await verifyCreatedRepositoryAccess(args(mock.request)), false);
    assert.equal(mock.calls.length, 1);
  }
});

test("rejects token scope and listed repository mismatches", async () => {
  for (const config of [
    { tokenRepoId: 99 }, { listRepoId: 92 },
    { fullName: "victim/studio-test" },
    { listOwner: "victim" }, { url: "https://github.com/victim/studio-test" },
    { expiry: "2026-10-24T21:00:00Z" },
  ]) {
    const mock = makeMock(config);
    assert.equal(await verifyCreatedRepositoryAccess(args(mock.request)), false);
  }
});

test("permission errors do not silently fall back to public repository reads", async () => {
  for (const config of [ { tokenStatus: 422 }, { tokenStatus: 403 }, { listStatus: 401 } ]) {
    const mock = makeMock(config);
    await assert.rejects(verifyCreatedRepositoryAccess(args(mock.request)),
      (e) => ["GITHUB_NOT_AUTHORIZED","PERMISSION_DENIED","AUTH_REQUIRED"].includes(e.code));
    assert.ok(mock.calls.length <= 3);
    assert.ok(mock.calls.every((c) => !c.url.includes("/repos/octocat/studio-test")));
  }
});

test("provider rejection never prints or returns raw tokens or errors", async () => {
  const mock = makeMock({ tokenStatus: 422 });
  await assert.rejects(verifyCreatedRepositoryAccess(args(mock.request)),
    (e) => !e.message.includes("mock-scoped-token"));
});
