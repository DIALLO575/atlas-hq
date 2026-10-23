import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";
import { capPaginatedItems, getNextPageUrl } from "../packages/connectors/github/src/pagination-contract.mjs";
import { parsePullRequestEvent } from "../packages/connectors/github/src/webhook-contract.mjs";

const contract = await readFile(new URL("../packages/connectors/github/src/contract.ts", import.meta.url), "utf8");
const compiledContract = ts.transpileModule(contract, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const compiledModule = { exports: {} };
new Function("exports", "module", compiledContract)(compiledModule.exports, compiledModule);
const runtimeContract = compiledModule.exports.githubMvpContract;
const deliveryId = "72d3162e-cc78-11e3-81ab-4c9367dc0958";
const fixture = {
  action: "synchronize",
  installation: { id: 81 },
  repository: { id: 19, name: "atlas-hq", owner: { login: "DIALLO575" } },
  pull_request: { number: 17, state: "open", draft: true, merged: false, head: { sha: "a".repeat(40) } },
};

test("GitHub MVP contract is read-only and has only the measured permissions", () => {
  assert.match(contract, /writesEnabled: false/);
  assert.match(contract, /name: "metadata"[\s\S]*access: "read"/);
  assert.match(contract, /name: "pull_requests"[\s\S]*access: "read"/);
  assert.doesNotMatch(contract, /access: "write"|contents:write|administration:write/i);
  assert.match(contract, /apiVersion: "2026-03-10"/);
  assert.match(contract, /pagination: "follow-link-header"/);
  assert.match(contract, /maxPageSize: 100/);
  assert.match(contract, /maxAttempts: 3/);
});

test("the consumed PR envelope creates a stable installation/repository/PR/head-SHA reference", () => {
  const event = parsePullRequestEvent("pull_request", deliveryId, fixture);
  assert.deepEqual(event, {
    provider: "github",
    event: "pull_request",
    action: "synchronize",
    deliveryId,
    resource: {
      provider: "github",
      installationId: 81,
      repositoryId: 19,
      owner: "DIALLO575",
      repository: "atlas-hq",
      pullRequestNumber: 17,
      headSha: "a".repeat(40),
    },
    payload: { status: { state: "open", isDraft: true, merged: false } },
  });
});

test("unconsumed events, actions, malformed IDs, SHA, delivery ID and status are ignored", () => {
  assert.equal(parsePullRequestEvent("issues", deliveryId, fixture), null);
  assert.equal(parsePullRequestEvent("pull_request", deliveryId, { ...fixture, action: "edited" }), null);
  for (const malformedDeliveryId of ["", 42, {}, "not-a-guid"]) {
    assert.equal(parsePullRequestEvent("pull_request", malformedDeliveryId, fixture), null);
  }
  assert.equal(parsePullRequestEvent("pull_request", deliveryId, { ...fixture, installation: { id: 0 } }), null);
  assert.equal(parsePullRequestEvent("pull_request", deliveryId, { ...fixture, repository: { ...fixture.repository, id: 0 } }), null);
  assert.equal(parsePullRequestEvent("pull_request", deliveryId, { ...fixture, pull_request: { ...fixture.pull_request, number: 0 } }), null);
  assert.equal(parsePullRequestEvent("pull_request", deliveryId, { ...fixture, pull_request: { ...fixture.pull_request, merged: "false" } }), null);
  assert.equal(parsePullRequestEvent("pull_request", deliveryId, { ...fixture, pull_request: { ...fixture.pull_request, state: "pending" } }), null);
  assert.equal(parsePullRequestEvent("pull_request", deliveryId, { ...fixture, pull_request: { ...fixture.pull_request, draft: 1 } }), null);
  assert.equal(parsePullRequestEvent("pull_request", deliveryId, { ...fixture, pull_request: { ...fixture.pull_request, head: { sha: "bad" } } }), null);
});

test("runtime matrix maps each capability to its exact method, endpoint, permission, events, risk, and test", () => {
  const expected = {
    "repositories.list": ["/installation/repositories", "metadata:read (implicit); no additional installation-token permission", ["installation", "installation_repositories"]],
    "pull_requests.read": ["/repos/{owner}/{repo}/pulls/{pull_number}", "pull_requests:read", ["pull_request:opened", "pull_request:reopened", "pull_request:synchronize", "pull_request:closed"]],
    "pull_requests.files.read": ["/repos/{owner}/{repo}/pulls/{pull_number}/files", "pull_requests:read", ["pull_request:opened", "pull_request:synchronize", "pull_request:reopened"]],
    "pull_requests.commits.read": ["/repos/{owner}/{repo}/pulls/{pull_number}/commits", "pull_requests:read", ["pull_request:opened", "pull_request:synchronize", "pull_request:reopened"]],
  };
  assert.equal(runtimeContract.endpoints.length, Object.keys(expected).length);
  for (const row of runtimeContract.endpoints) {
    const [path, permission, events] = expected[row.capability] ?? [];
    assert.ok(path, `unexpected capability ${row.capability}`);
    assert.equal(row.method, "GET");
    assert.equal(row.path, path);
    assert.equal(row.requiredPermission, permission);
    assert.deepEqual(row.events, events);
    assert.ok(row.risk.length > 0);
    assert.ok(row.test.length > 0);
  }
  assert.equal(runtimeContract.writesEnabled, false);
  assert.equal(runtimeContract.api.pagination, "follow-link-header");
  assert.equal(runtimeContract.api.maxPageSize, 100);
  assert.deepEqual(runtimeContract.api.retry.methods, ["GET", "HEAD"]);
  assert.ok(runtimeContract.excluded.includes("GitHub MCP as an authentication or execution path (experimental follow-up only)"));
  assert.ok(contract.includes("githubMcp: \"V1/experimental"));
});

test("Link pagination follows only GitHub API next relations", () => {
  assert.equal(getNextPageUrl('<https://api.github.com/repos/a/b/pulls?page=2&filter=x,y>; rel="next", <https://api.github.com/repos/a/b/pulls?page=5>; rel="last"'), "https://api.github.com/repos/a/b/pulls?page=2&filter=x,y");
  assert.equal(getNextPageUrl('<https://api.github.com/repos/a/b/pulls?page=1>; rel="prev", <https://api.github.com/repos/a/b/pulls?page=5>; rel="last"'), null);
  assert.equal(getNextPageUrl('<https://attacker.example/steal>; rel="next"'), null);
  assert.equal(getNextPageUrl(null), null);
});

test("documented endpoint caps truncate and report whether more data exists", () => {
  const files = Array.from({ length: 3001 }, (_, index) => index);
  const fileResult = capPaginatedItems(files, 3000, true);
  assert.equal(fileResult.items.length, 3000);
  assert.equal(fileResult.truncated, true);
  const commits = capPaginatedItems(Array.from({ length: 250 }, (_, index) => index), 250, false);
  assert.equal(commits.items.length, 250);
  assert.equal(commits.truncated, true);
  for (const [length, maximum, hasNextPage, truncated] of [
    [249, 250, false, false],
    [249, 250, true, true],
    [0, 250, false, false],
    [0, 250, true, true],
    [251, 250, false, true],
    [0, 0, false, false],
    [0, 0, true, true],
    [1, 0, false, true],
  ]) {
    const items = Array.from({ length }, (_, index) => index);
    const result = capPaginatedItems(items, maximum, hasNextPage);
    assert.deepEqual(result.items, items.slice(0, maximum));
    assert.equal(result.truncated, truncated, `${length}/${maximum}, hasNextPage=${hasNextPage}`);
  }
  assert.throws(() => capPaginatedItems([], -1, false), TypeError);
});
