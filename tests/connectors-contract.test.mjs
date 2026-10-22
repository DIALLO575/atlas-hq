import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { ConnectorError } from "../src/lib/connectors/contracts.ts";
import { GitHubConnector } from "../src/lib/connectors/github.ts";
import { describeLinear } from "../src/lib/connectors/linear.ts";
import { assertCapabilityManifest, assertScopedNormalizedResource } from "./support/connector-contract-assertions.mjs";

const githubSearchFixture = JSON.parse(readFileSync(new URL("./fixtures/connectors/github-search-response.json", import.meta.url), "utf8"));

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

test("shared capability contract rejects unsupported enabled states", () => {
  const github = new GitHubConnector({ async resolve() { return "mock-secret"; } });
  const githubCapabilities = assertCapabilityManifest(github, connection);
  assert.deepEqual(githubCapabilities.map(({ id }) => id), ["issues.search", "issues.read", "issues.create"]);

  const linearCapabilities = assertCapabilityManifest({ describe: (candidate) => describeLinear(candidate) }, { ...connection, provider: "linear" });
  assert.deepEqual(linearCapabilities.map(({ id }) => id), ["issues.search", "issues.read", "issues.create", "webhooks.subscribe"]);
});

test("shared read contract scopes resources and keeps server credentials out of results", async () => {
  const secretInputs = [];
  let request;
  const adapter = new GitHubConnector(
    { async resolve(input) { secretInputs.push(input); return "mock-secret"; } },
    async (url, init) => {
      request = { url: String(url), init };
      return Response.json(githubSearchFixture);
    },
    () => new Date("2026-10-22T18:00:00Z"),
  );

  const result = await adapter.searchIssues(connection, "contract fixture");
  assert.deepEqual(secretInputs, [{ ownerId: connection.ownerId, connectionId: connection.id, secretRef: connection.secretRef }]);
  assert.equal(request.init.headers.Authorization, "Bearer mock-secret");
  assertScopedNormalizedResource(result.items[0], { connectionId: connection.id, provider: "github" });
  assert.ok(!JSON.stringify(result).includes("mock-secret"));
});

test("direct reads normalize provider identity, URL and observation time", async () => {
  let requestedUrl;
  const adapter = new GitHubConnector(
    { async resolve() { return "mock-secret"; } },
    async (url) => {
      requestedUrl = String(url);
      return Response.json(githubSearchFixture.items[0]);
    },
    () => new Date("2026-10-22T18:00:00Z"),
  );

  const resource = await adapter.getIssue(connection, "7");
  assert.equal(requestedUrl, "https://api.github.com/repos/DIALLO575/atlas-hq/issues/7");
  assertScopedNormalizedResource(resource, { connectionId: connection.id, provider: "github" });
  assert.equal(resource.canonicalUrl, githubSearchFixture.items[0].html_url);
  assert.equal(resource.sourceUpdatedAt, githubSearchFixture.items[0].updated_at);
});

test("authentication and provider mismatch stop before resolving a credential or calling the provider", async () => {
  let secretCalls = 0;
  let requestCalls = 0;
  const adapter = new GitHubConnector(
    { async resolve() { secretCalls += 1; return "mock-secret"; } },
    async () => { requestCalls += 1; return Response.json({ items: [] }); },
  );

  await assert.rejects(() => adapter.searchIssues({ ...connection, state: "disconnected" }, "x"), { code: "AUTH_REQUIRED" });
  await assert.rejects(() => adapter.searchIssues({ ...connection, provider: "linear" }, "x"), { code: "VALIDATION_FAILED" });
  assert.equal(secretCalls, 0);
  assert.equal(requestCalls, 0);
});

test("a prepared write cannot be replayed against another connection", async () => {
  let requestCalls = 0;
  const adapter = new GitHubConnector(
    { async resolve() { return "mock-secret"; } },
    async () => { requestCalls += 1; return Response.json({}); },
  );
  const command = adapter.prepareCreateIssue(connection, { title: "Connection isolation" });
  const otherConnection = { ...connection, id: "conn-2", accountId: "repo-2", accountLabel: "example/other" };

  await assert.rejects(
    () => adapter.executeCreateIssue(otherConnection, command, command.payloadHash, "isolated-key", memoryStore()),
    { code: "VALIDATION_FAILED" },
  );
  assert.equal(requestCalls, 0);
});

test("provider errors normalize authentication, permissions, visibility and rate limits", async (t) => {
  const cases = [
    { name: "401", status: 401, expected: "AUTH_REQUIRED" },
    { name: "403", status: 403, expected: "PERMISSION_DENIED" },
    { name: "404", status: 404, expected: "NOT_FOUND_OR_HIDDEN" },
    { name: "429 with retry-after", status: 429, expected: "RATE_LIMITED", retryAfter: "17", seconds: 17 },
    { name: "403 with retry-after", status: 403, expected: "RATE_LIMITED", retryAfter: "9", seconds: 9 },
  ];

  for (const scenario of cases) {
    await t.test(scenario.name, async () => {
      const adapter = new GitHubConnector(
        { async resolve() { return "mock-secret"; } },
        async () => new Response(JSON.stringify({ message: "synthetic provider error" }), {
          status: scenario.status,
          headers: scenario.retryAfter ? { "retry-after": scenario.retryAfter } : undefined,
        }),
      );

      await assert.rejects(() => adapter.getIssue(connection, "7"), (error) => {
        assert.ok(error instanceof ConnectorError);
        assert.equal(error.code, scenario.expected);
        assert.ok(!error.message.includes("mock-secret"));
        if (scenario.seconds !== undefined) assert.equal(error.retryAfterSeconds, scenario.seconds);
        return true;
      });
    });
  }
});
