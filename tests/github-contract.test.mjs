import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { parsePullRequestEvent } from "../packages/connectors/github/src/webhook-contract.mjs";

const contract = await readFile(new URL("../packages/connectors/github/src/contract.ts", import.meta.url), "utf8");
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
  const event = parsePullRequestEvent("pull_request", "delivery-1", fixture);
  assert.deepEqual(event, {
    provider: "github",
    event: "pull_request",
    action: "synchronize",
    deliveryId: "delivery-1",
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

test("unconsumed events, actions, and malformed identity fields are ignored", () => {
  assert.equal(parsePullRequestEvent("issues", "delivery-1", fixture), null);
  assert.equal(parsePullRequestEvent("pull_request", "delivery-1", { ...fixture, action: "edited" }), null);
  assert.equal(parsePullRequestEvent("pull_request", "", fixture), null);
  assert.equal(parsePullRequestEvent("pull_request", "delivery-1", { ...fixture, installation: { id: 0 } }), null);
  assert.equal(parsePullRequestEvent("pull_request", "delivery-1", { ...fixture, pull_request: { ...fixture.pull_request, merged: "false" } }), null);
  assert.equal(parsePullRequestEvent("pull_request", "delivery-1", { ...fixture, pull_request: { ...fixture.pull_request, head: { sha: "bad" } } }), null);
});

test("contract records exact capability endpoint, least permission, event, risk, and test coverage per row", () => {
  const rows = [...contract.matchAll(/capability: "([^"]+)"/g)];
  assert.equal(rows.length, 4);
  for (const key of ["path:", "requiredPermission:", "events:", "risk:", "test:"]) {
    assert.equal((contract.match(new RegExp(key, "g")) ?? []).length >= 4, true, `${key} is mapped for each capability`);
  }
  assert.match(contract, /installation_repositories/);
  assert.match(contract, /githubMcp: "V1\/experimental/);
});
