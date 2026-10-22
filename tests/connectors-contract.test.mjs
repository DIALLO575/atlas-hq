import assert from "node:assert/strict";
import test from "node:test";
import { ConnectorError } from "../src/lib/connectors/contracts.ts";
import { GitHubConnector } from "../src/lib/connectors/github.ts";
import { describeLinear } from "../src/lib/connectors/linear.ts";

const connection = {
  id: "conn-1",
  ownerId: "user-1",
  provider: "github",
  accountId: "repo-1",
  accountLabel: "DIALLO575/atlas-hq",
  state: "connected",
  grantedScopes: ["Issues: read", "Issues: write"],
  secretRef: "vault://connections/conn-1",
};

function memoryStore() {
  const records = new Map();
  return {
    async reserve(key, hash) {
      const current = records.get(key);
      if (!current) { records.set(key, { hash, state: "reserved" }); return { state: "reserved" }; }
      if (current.hash !== hash) return { state: "conflict" };
      return current.state === "completed"
        ? { state: "completed", receipt: current.receipt }
        : { state: current.state };
    },
    async complete(key, receipt) { records.set(key, { ...records.get(key), state: "completed", receipt }); },
    async markUnknown(key) { records.set(key, { ...records.get(key), state: "unknown_outcome" }); },
  };
}

test("GitHub reads normalize issue identity, source URL and freshness", async () => {
  let request;
  const adapter = new GitHubConnector(
    { async resolve(input) { assert.deepEqual(input, { ownerId: "user-1", connectionId: "conn-1", secretRef: connection.secretRef }); return "mock-secret"; } },
    async (url, init) => { request = { url: String(url), init }; return Response.json({ items: [{ number: 7, title: "Connector", body: "Summary", html_url: "https://github.com/DIALLO575/atlas-hq/issues/7", updated_at: "2026-10-22T12:00:00Z", repository_url: "https://api.github.com/repos/DIALLO575/atlas-hq" }] }); },
    () => new Date("2026-10-22T18:00:00Z"),
  );
  const result = await adapter.searchIssues(connection, "connector");
  assert.match(request.url, /repo%3ADIALLO575%2Fatlas-hq/);
  assert.equal(request.init.headers.Authorization, "Bearer mock-secret");
  assert.deepEqual(result.items[0], {
    connectionId: "conn-1", provider: "github", objectType: "issue", providerObjectId: "7",
    title: "Connector", summary: "Summary", canonicalUrl: "https://github.com/DIALLO575/atlas-hq/issues/7",
    sourceUpdatedAt: "2026-10-22T12:00:00Z", observedAt: "2026-10-22T18:00:00.000Z",
    providerData: { repositoryUrl: "https://api.github.com/repos/DIALLO575/atlas-hq" },
  });
});

test("GitHub pull request context includes metadata and changed-file patches", async () => {
  const requests = [];
  const adapter = new GitHubConnector(
    { async resolve() { return "mock-secret"; } },
    async (url) => {
      requests.push(String(url));
      if (String(url).includes("/pulls/17/files")) return Response.json([{ filename: "src/auth.ts", status: "modified", additions: 2, deletions: 1, patch: "@@ -1 +1 @@" }]);
      return Response.json({ number: 17, title: "Fix tenant scope", body: "Review auth.", state: "open", user: { login: "dev" }, base: { ref: "main" }, head: { ref: "fix/scope", sha: "abc123" }, html_url: "https://github.com/DIALLO575/atlas-hq/pull/17", updated_at: "2026-10-22T17:00:00Z" });
    },
    () => new Date("2026-10-22T18:00:00Z"),
  );
  const result = await adapter.getPullRequestContext(connection, "17");
  assert.deepEqual(requests.map((url) => new URL(url).pathname), [
    "/repos/DIALLO575/atlas-hq/pulls/17",
    "/repos/DIALLO575/atlas-hq/pulls/17/files",
  ]);
  assert.equal(result.resource.objectType, "pull_request");
  assert.equal(result.resource.connectionId, "conn-1");
  assert.equal(result.headSha, "abc123");
  assert.deepEqual(result.changedFiles, [{ path: "src/auth.ts", status: "modified", additions: 2, deletions: 1, patch: "@@ -1 +1 @@" }]);
});

test("writes require a matching approved preview, granted scope and idempotency", async () => {
  let calls = 0;
  const adapter = new GitHubConnector(
    { async resolve() { return "mock-secret"; } },
    async () => { calls += 1; return Response.json({ number: 9, title: "Test issue", body: "Body", html_url: "https://github.com/DIALLO575/atlas-hq/issues/9", updated_at: "2026-10-22T12:00:00Z", repository_url: "https://api.github.com/repos/DIALLO575/atlas-hq" }); },
  );
  const command = adapter.prepareCreateIssue(connection, { title: " Test issue ", body: " Body " });
  const store = memoryStore();
  const first = await adapter.executeCreateIssue(connection, command, command.payloadHash, "create-issue-9", store);
  const replay = await adapter.executeCreateIssue(connection, command, command.payloadHash, "create-issue-9", store);
  assert.equal(first.providerObjectId, "9");
  assert.deepEqual(replay, first);
  assert.equal(calls, 1);
  await assert.rejects(() => adapter.executeCreateIssue(connection, command, "different-preview", "another-key", store), { code: "VALIDATION_FAILED" });
  await assert.rejects(() => adapter.executeCreateIssue(connection, { ...command, input: { title: "changed" } }, command.payloadHash, "another-key", store), { code: "VALIDATION_FAILED" });
});

test("timeout records an unknown outcome and blocks blind replay", async () => {
  const store = memoryStore();
  const adapter = new GitHubConnector({ async resolve() { return "mock-secret"; } }, async () => { throw new Error("network lost"); });
  const command = adapter.prepareCreateIssue(connection, { title: "Potential duplicate" });
  await assert.rejects(() => adapter.executeCreateIssue(connection, command, command.payloadHash, "unknown-1", store), (error) => error instanceof ConnectorError && error.code === "TIMEOUT_UNKNOWN_OUTCOME");
  await assert.rejects(() => adapter.executeCreateIssue(connection, command, command.payloadHash, "unknown-1", store), { code: "TIMEOUT_UNKNOWN_OUTCOME" });
});

test("missing authentication and Linear capability checks stay explicit", async () => {
  const adapter = new GitHubConnector({ async resolve() { throw new Error("must not read secrets"); } });
  await assert.rejects(() => adapter.health({ ...connection, state: "reauthorization_required" }), { code: "AUTH_REQUIRED" });
  assert.ok(adapter.describe(connection).every((capability) => capability.state === "unknown" && capability.evidence === "not_verified"));
  const capabilities = describeLinear({ ...connection, provider: "linear", state: "disconnected", secretRef: undefined });
  assert.ok(capabilities.every((capability) => capability.state === "unknown" && capability.evidence === "not_verified"));
});
