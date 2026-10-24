import assert from "node:assert/strict";
import test from "node:test";
import { generateKeyPairSync } from "node:crypto";
import { createAuthorizedGitHubReader } from "../packages/connectors/github/src/authorized-reader.mjs";
import { GitHubReadError } from "../packages/connectors/github/src/github-app-client.mjs";

const { privateKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" },
});
const now = () => Date.parse("2026-10-23T12:00:00Z");
const authorized = {
  tenantId: "workspace-a",
  installationId: 77,
  status: "repositories-ready",
  repositorySelection: "selected",
  repositories: [{ id: 7, fullName: "example/repo" }],
};
const json = (value, status = 200) => new Response(JSON.stringify(value), { status });

test("rejects any missing, unverified or cross-workspace binding before contacting GitHub", async () => {
  const invalid = [
    null,
    { ...authorized, tenantId: "workspace-b" },
    { ...authorized, installationId: 78 },
    { ...authorized, status: "pending-ownership-check" },
    { ...authorized, status: "active" },
    { ...authorized, status: "selection-rejected" },
    { ...authorized, repositorySelection: "unknown" },
    { ...authorized, repositorySelection: "all", repositories: [{ id: 7 }] },
    { ...authorized, repositories: [] },
  ];
  for (const stored of invalid) {
    let calls = 0;
    await assert.rejects(createAuthorizedGitHubReader({
      tenantId: "workspace-a", installationId: 77,
      lookup: async () => stored,
      appId: "1234", privateKey, now,
      request: async () => { calls++; throw new Error("must never reach GitHub"); },
    }), (error) => error instanceof GitHubReadError && error.code === "PERMISSION_DENIED");
    assert.equal(calls, 0);
  }
});

test("rejects corrupted persisted repository IDs without any GitHub request", async () => {
  for (const repositories of [[{ id: 0 }], [{ id: "7" }], [{ id: 7 }, { id: 7 }]]) {
    let calls = 0;
    await assert.rejects(createAuthorizedGitHubReader({
      tenantId: "workspace-a", installationId: 77,
      lookup: async () => ({ ...authorized, repositories }),
      appId: "1234", privateKey, now,
      request: async () => { calls++; throw new Error("never"); },
    }), (error) => error.code === "INVALID_RESPONSE");
    assert.equal(calls, 0);
  }
});

test("reads a PR only after server-verified binding, using scoped installation credentials", async () => {
  const seen = [];
  const client = await createAuthorizedGitHubReader({
    tenantId: "workspace-a", installationId: 77,
    lookup: async ({ tenantId, installationId }) => {
      assert.deepEqual({ tenantId, installationId }, { tenantId: "workspace-a", installationId: 77 });
      return authorized;
    },
    appId: "1234", privateKey, now,
    request: async (url, init) => {
      seen.push({ url, init });
      if (url.endsWith("/app/installations/77/access_tokens")) {
        assert.deepEqual(JSON.parse(init.body), {
          repository_ids: [7], permissions: { pull_requests: "read" },
        });
        return json({ token: "ghs-test-secret", expires_at: "2026-10-23T13:00:00Z",
          permissions: { pull_requests: "read" },
          repositories: [{ id: 7 }] }, 201);
      }
      assert.equal(init.headers.Authorization, "Bearer ghs-test-secret");
      if (url.endsWith("/installation/repositories?per_page=100")) {
        return json({ repository_selection: "selected", total_count: 1,
          repositories: [{ id: 7, full_name: "example/repo", private: true, default_branch: "main" }] });
      }
      if (url.endsWith("/repos/example/repo/pulls/42")) {
        return json({ number: 42, title: "Secure auth", body: "Review",
          state: "open", draft: false, merged: false, head: { sha: "a".repeat(40) } });
      }
      if (url.endsWith("/repos/example/repo/pulls/42/files?per_page=100")) {
        return json([{ filename: "auth.ts", status: "modified", additions: 3, deletions: 1, patch: "@@ -1 +1 @@" }]);
      }
      throw new Error(`Unexpected GitHub call: ${url}`);
    },
  });
  assert.equal("token" in client, false);
  await assert.rejects(client.getPullRequest(8, 42), (error) => error.code === "PERMISSION_DENIED");
  const detail = await client.getPullRequest(7, 42);
  assert.equal(detail.resource.installationId, 77);
  assert.equal(detail.resource.repositoryId, 7);
  assert.equal(detail.resource.pullRequestNumber, 42);
  assert.equal(detail.resource.headSha, "a".repeat(40));
  assert.equal(detail.files[0].path, "auth.ts");
  assert.equal(seen.length, 4);
});

test("all installation grants are tenant bound and token permissions remain read-only", async () => {
  const calls = [];
  const client = await createAuthorizedGitHubReader({
    tenantId: "workspace-a", installationId: 77,
    lookup: async ({ tenantId, installationId }) => {
      assert.equal(tenantId, "workspace-a");
      assert.equal(installationId, 77);
      return { ...authorized, repositorySelection: "all", repositories: [] };
    },
    appId: "1234", privateKey, now,
    request: async (url, init) => {
      calls.push(url);
      if (url.endsWith("/access_tokens")) {
        assert.deepEqual(JSON.parse(init.body), { permissions: { pull_requests: "read" } });
        return json({ token: "ghs-fake", expires_at: "2026-10-23T13:00:00Z",
          permissions: { pull_requests: "read" } }, 201);
      }
      assert.equal(init.headers.Authorization, "Bearer ghs-fake");
      if (url.includes("/installation/repositories")) {
        return json({ repository_selection: "all", total_count: 2,
          repositories: [{ id: 7, full_name: "example/first", private: true },
            { id: 8, full_name: "example/future", private: true }] });
      }
      if (url.includes("/repos/example/future/pulls?")) return json([]);
      throw new Error("Unexpected request");
    },
  });
  const list = await client.listRepositories();
  assert.deepEqual(list.repositories.map(x => x.id), [7, 8]);
  assert.deepEqual((await client.listPullRequests(8)).pullRequests, []);
  assert.equal(calls.filter(x => x.includes("/access_tokens")).length, 1);
  await assert.rejects(client.getPullRequest(999, 1), (error) => error.code === "PERMISSION_DENIED");
});

test("fails closed when persistent authorization storage cannot be read", async () => {
  await assert.rejects(createAuthorizedGitHubReader({
    tenantId: "workspace-a", installationId: 77,
    lookup: async () => { throw new Error("database down"); },
    appId: "1234", privateKey, now,
    request: async () => { throw new Error("should not reach network"); },
  }), (error) => error.code === "PROVIDER_UNAVAILABLE" && !error.message.includes("database down"));
});
