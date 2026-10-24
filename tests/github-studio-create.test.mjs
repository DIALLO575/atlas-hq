import assert from "node:assert/strict";
import test from "node:test";
import { generateKeyPairSync } from "node:crypto";
import { GitHubStudioError, parseRepositoryDraft, verifiedPersonalInstallation,
  createPersonalRepository } from "../packages/connectors/github/src/github-studio-create.mjs";

const { privateKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" },
});
const workspaceId = "d7b94738-0703-49dd-9a3d-f19d1a4287ac";
const binding = { workspaceId, installationId: 77, status: "repositories-ready",
  repositorySelection: "selected", ownershipVerifiedAt: "2026-10-24T10:00:00Z",
  repositoriesVerifiedAt: "2026-10-24T10:00:00Z" };
const now = () => Date.parse("2026-10-24T12:00:00Z");
const body = (obj, status = 200, headers = {}) =>
  new Response(JSON.stringify(obj), { status, headers });
const valid = () => ({ name: "sample-studio", private: true, autoInit: true });

test("draft validation strictly rejects owner spoofing, unknown fields, malformed inputs", () => {
  const parsed = parseRepositoryDraft({ workspaceId, installationId: 77, name: "repo" });
  assert.equal(parsed.private, true);
  assert.equal(parsed.autoInit, true);
  for (const bad of [
    { workspaceId, installationId: 77, name: "repo", owner: "victim" },
    { workspaceId, installationId: "77", name: "repo" },
    { workspaceId, installationId: 77, name: "../escape" },
    { workspaceId, installationId: 77, name: "repo", private: "false" },
    { workspaceId, installationId: 77, name: "." },
    { workspaceId, installationId: 77, name: "repo", description: "x".repeat(351) },
  ]) assert.throws(() => parseRepositoryDraft(bad), (e) => e.code === "INVALID_INPUT");
});

test("tenant and installation binding must be previously verified, before any GitHub call", async () => {
  for (const value of [null, { ...binding, workspaceId: "other" },
    { ...binding, status: "active" }, { ...binding, repositorySelection: "none" },
    { ...binding, repositoriesVerifiedAt: null }]) {
    assert.equal(verifiedPersonalInstallation(value, workspaceId, 77), false);
    let calls = 0;
    await assert.rejects(createPersonalRepository({ workspaceId, installationId: 77,
      binding: value, draft: valid(), appId: "123", privateKey, now,
      request: () => { calls++; throw Error("should not call"); } }),
    (e) => e.code === "PERMISSION_DENIED");
    assert.equal(calls, 0);
  }
});

test("creates a personal repository only with a verified GitHub App USER token", async () => {
  const calls = [];
  const request = async (url, init) => {
    calls.push([url, init]);
    if (url.endsWith("/app/installations/77")) return body({
      id: 77, target_type: "User", account: { login: "octocat" },
      permissions: { repository_creation: "write" }, suspended_at: null });
    if (url.endsWith("/user")) {
      assert.equal(init.headers.Authorization, "Bearer mock-user-token");
      return body({ login: "octocat", type: "User" });
    }
    assert.equal(url, "https://api.github.com/user/repos");
    assert.equal(init.headers.Authorization, "Bearer mock-user-token");
    assert.deepEqual(JSON.parse(init.body), {
      name: "sample-studio", description: "", private: true, auto_init: true,
    });
    return body({ id: 91, full_name: "octocat/sample-studio",
      owner: { login: "octocat" }, private: true,
      html_url: "https://github.com/octocat/sample-studio" }, 201);
  };
  const result = await createPersonalRepository({
    workspaceId, installationId: 77, binding, draft: valid(),
    appId: "1234", privateKey, userAccessToken: "mock-user-token", now, request,
  });
  assert.deepEqual(result, { repositoryId: 91, fullName: "octocat/sample-studio",
    url: "https://github.com/octocat/sample-studio",
    private: true, reconciliationRequired: true });
  assert.equal(calls.length, 3);
  assert.equal(calls[0][1].method, "GET");
  assert.equal(calls[1][1].method, "GET");
  assert.equal(calls[2][1].method, "POST");
});

test("refuses nonpersonal and ungranted installations without creating", async () => {
  for (const installation of [
    { id: 77, target_type: "Organization", account: { login: "test-org" },
      permissions: { repository_creation: "write" } },
    { id: 77, target_type: "User", account: { login: "octocat" }, permissions: {} },
    { id: 77, target_type: "User", account: { login: "octocat" },
      permissions: { repository_creation: "write" }, suspended_at: "2026-10-24" },
  ]) {
    let calls = 0;
    await assert.rejects(createPersonalRepository({ workspaceId, installationId: 77,
      binding, draft: valid(), appId: "1234", privateKey, userAccessToken: "mock-user-token", now,
      request: () => { calls++; return body(installation); } }),
    (e) => e.code === "PERMISSION_DENIED");
    assert.equal(calls, 1);
  }
});

test("provider failures never retry POST nor expose GitHub errors", async () => {
  for (const status of [403, 422, 429, 500]) {
    let calls = 0;
    const mock = async (url) => {
      calls++;
      if (url.endsWith("/app/installations/77")) return body({
        id: 77, target_type: "User", account: { login: "octocat" },
        permissions: { repository_creation: "write" } });
      if (url.endsWith("/user")) return body({ login: "octocat", type: "User" });
      return body({ message: "sensitive provider message" }, status);
    };
    await assert.rejects(createPersonalRepository({ workspaceId, installationId: 77,
      binding, draft: valid(), appId: "1234", privateKey, userAccessToken: "mock-user-token", now, request: mock }),
    (e) => e instanceof GitHubStudioError && !e.message.includes("sensitive"));
    assert.equal(calls, 3);
  }
});

test("without a trusted user token, no GitHub POST or DB-side effect may start", async () => {
  let calls = 0;
  await assert.rejects(createPersonalRepository({
    workspaceId, installationId: 77, binding, draft: valid(),
    appId: "1234", privateKey, now,
    request: () => { calls++; throw Error("should not call"); },
  }), e => e.code === "USER_TOKEN_REQUIRED");
  assert.equal(calls, 0);
});

test("a GitHub user token for a different account cannot create a repository", async () => {
  let calls = 0;
  const request = async (url) => {
    calls++;
    if (url.endsWith("/app/installations/77")) return body({
      id: 77, target_type: "User", account: { login: "octocat" },
      permissions: { repository_creation: "write" }, suspended_at: null,
    });
    if (url.endsWith("/user")) return body({ login: "attacker", type: "User" });
    throw Error("must not write");
  };
  await assert.rejects(createPersonalRepository({
    workspaceId, installationId: 77, binding, draft: valid(),
    appId: "1234", privateKey, userAccessToken: "wrong-user", now, request,
  }), e => e.code === "PERMISSION_DENIED");
  assert.equal(calls, 2);
});
