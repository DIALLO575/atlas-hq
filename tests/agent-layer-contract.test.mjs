import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const fixture = JSON.parse(await readFile(
  new URL("./fixtures/agent-layer/pr-vision-mission.json", import.meta.url),
  "utf8",
));

const CONTEXT_ALLOWLIST = ["title", "body", "baseRef", "headRef", "headSha", "changedFiles"];
const MISSION_STATES = new Set(["queued", "running", "succeeded", "failed", "retryable"]);
const SECRET_PATTERN = /(?:bearer\s+[\w.-]+|gh[pousr]_[\w]+|token|secret)/i;

function expectedIdempotencyKey(request) {
  return [
    request.requestedBy.userId,
    request.requestedBy.workspaceId,
    request.source.provider,
    request.source.repository,
    request.source.pullRequestNumber,
    request.source.headSha,
    request.agent.id,
  ].join(":");
}

function assertPrMissionRequest(request) {
  assert.equal(request.source.provider, "github");
  assert.equal(request.source.resourceType, "pull_request");
  assert.match(request.source.url, /^https:\/\/github\.com\/[^/]+\/[^/]+\/pull\/\d+$/);
  assert.equal(request.source.pullRequestNumber, Number(request.source.url.split("/").at(-1)));
  assert.equal(request.context.headSha, request.source.headSha);
  assert.deepEqual(Object.keys(request.context).sort(), [...CONTEXT_ALLOWLIST].sort());
  assert.ok(request.agent.id && request.requestedBy.userId && request.requestedBy.workspaceId);
  assert.equal(request.idempotencyKey, expectedIdempotencyKey(request));
  assert.ok(!SECRET_PATTERN.test(JSON.stringify(request)));
  assert.equal(request.context.changedFiles.length > 0, true);
}

function assertMissionEvent(event, request) {
  assert.ok(MISSION_STATES.has(event.status), "mission status is part of the public lifecycle");
  assert.equal(event.missionId, request.id);
  assert.equal(event.source.provider, request.source.provider);
  assert.equal(event.source.repository, request.source.repository);
  assert.equal(event.source.pullRequestNumber, request.source.pullRequestNumber);
  assert.equal(event.source.headSha, request.source.headSha);
  assert.ok(!SECRET_PATTERN.test(JSON.stringify(event)));
  if (event.status === "succeeded") assert.equal(event.result?.url, request.source.url);
  if (["failed", "retryable"].includes(event.status)) assert.ok(event.error?.code);
}

test("synthetic PR-to-VISION request carries an exact, bounded context", () => {
  assertPrMissionRequest(fixture);
  assert.equal(fixture.agent.displayName, "VISION");
  assert.equal(fixture.source.repository, "DIALLO575/atlas-hq");
  assert.equal(fixture.source.pullRequestNumber, 42);
  assert.equal(fixture.source.headSha, fixture.context.headSha);
});

test("request contract rejects cross-resource identity and unapproved context", () => {
  assert.throws(() => assertPrMissionRequest({
    ...fixture,
    source: { ...fixture.source, pullRequestNumber: 41 },
  }));
  assert.throws(() => assertPrMissionRequest({
    ...fixture,
    context: { ...fixture.context, otherWorkspaceDocuments: ["private-doc-fixture"] },
  }));
});

test("request contract rejects secret-like context", () => {
  assert.throws(() => assertPrMissionRequest({
    ...fixture,
    context: { ...fixture.context, body: "Authorization: Bearer synthetic-secret" },
  }));
});

test("idempotency key is scoped to requester, workspace, resource revision and agent", () => {
  assert.equal(fixture.idempotencyKey, expectedIdempotencyKey(fixture));
  assert.notEqual(
    expectedIdempotencyKey({ ...fixture, requestedBy: { ...fixture.requestedBy, workspaceId: "workspace-fixture-2" } }),
    fixture.idempotencyKey,
  );
  assert.notEqual(
    expectedIdempotencyKey({ ...fixture, source: { ...fixture.source, pullRequestNumber: 43 } }),
    fixture.idempotencyKey,
  );
  assert.notEqual(
    expectedIdempotencyKey({ ...fixture, agent: { id: "agent-other" } }),
    fixture.idempotencyKey,
  );
});

test("mission events remain attached to the same PR and source revision", () => {
  for (const status of ["queued", "running", "succeeded"]) {
    assertMissionEvent({
      missionId: fixture.id,
      status,
      source: fixture.source,
      ...(status === "succeeded" ? { result: { url: fixture.source.url } } : {}),
    }, fixture);
  }
  assert.throws(() => assertMissionEvent({
    missionId: fixture.id,
    status: "succeeded",
    source: { ...fixture.source, pullRequestNumber: 43 },
    result: { url: "https://github.com/DIALLO575/atlas-hq/pull/43" },
  }, fixture));
  assert.throws(() => assertMissionEvent({
    missionId: fixture.id,
    status: "succeeded",
    source: fixture.source,
    result: { url: "https://github.com/DIALLO575/atlas-hq/pull/43" },
  }, fixture));
});

test("retryable and failed events require a normalized error code", () => {
  for (const status of ["retryable", "failed"]) {
    assertMissionEvent({
      missionId: fixture.id,
      status,
      source: fixture.source,
      error: { code: "PROVIDER_UNAVAILABLE" },
    }, fixture);
    assert.throws(() => assertMissionEvent({
      missionId: fixture.id,
      status,
      source: fixture.source,
    }, fixture));
  }
});

test("unknown mission states are rejected instead of shown as completed", () => {
  assert.throws(() => assertMissionEvent({
    missionId: fixture.id,
    status: "accepted",
    source: fixture.source,
  }, fixture));
});
