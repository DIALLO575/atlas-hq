import test from "node:test";
import assert from "node:assert/strict";
import { AgentBridge, UnavailableOpenMausBotGateway } from "../src/lib/agents/agent-bridge.ts";
import { ContextResolver } from "../src/lib/agents/context-resolver.ts";
import { AgentLayerError } from "../src/lib/agents/contracts.ts";

const prRef = { provider: "github", objectType: "pull_request", objectId: "17", connectionId: "gh-1", canonicalUrl: "https://github.com/acme/app/pull/17" };
const pr = {
  resource: prRef, title: "Fix auth boundary", body: "Check the tenant boundary.", state: "open", author: "dev",
  baseBranch: "main", headBranch: "fix/auth", headSha: "abc123", sourceUpdatedAt: "2026-10-22T12:00:00.000Z",
  observedAt: "2026-10-22T12:02:00.000Z", canonicalUrl: prRef.canonicalUrl,
  changedFiles: [{ path: "src/auth.ts", status: "modified", additions: 3, deletions: 1, patch: "@@ -1 +1 @@\n-old\n+new" }],
};

function setup({ allowed = true, gateway } = {}) {
  const relatedResource = {
    connectionId: "gh-1", provider: "github", objectType: "pull_request", providerObjectId: "17", title: pr.title,
    canonicalUrl: prRef.canonicalUrl, sourceUpdatedAt: pr.sourceUpdatedAt, observedAt: pr.observedAt,
  };
  const related = [];
  const store = new Map();
  const relationWrites = [];
  const calls = [];
  const access = { async canRead({ ownerId }) { return ownerId === "owner-1" && allowed; } };
  const relationStore = {
    async listRelated() { return [relatedResource]; },
    async saveAgentRelation(relation) { relationWrites.push(relation); },
  };
  const contextResolver = new ContextResolver({ async getPullRequest() { return pr; } }, relationStore, access, () => new Date("2026-10-22T12:03:00.000Z"));
  const missionStore = {
    async reserve(input) {
      const current = store.get(input.requestKey);
      if (current) return current.requestHash === input.requestHash ? { state: "existing", record: current } : { state: "conflict" };
      store.set(input.requestKey, { ...input, requestState: "creating", updatedAt: "2026-10-22T12:03:00.000Z" });
      return { state: "reserved" };
    },
    async saveReceipt({ requestKey, receipt }) { Object.assign(store.get(requestKey), receipt, { requestState: "created" }); },
    async updateRequestState({ requestKey, state }) { store.get(requestKey).requestState = state; },
    async saveSnapshot({ snapshot }) { store.set(`mission:${snapshot.missionId}`, snapshot); },
    async get({ missionId }) { return [...store.values()].find((record) => record.missionId === missionId); },
  };
  const missionGateway = gateway ?? {
    async createMission(input) { calls.push(input); return { missionId: "mission-1", state: "queued", createdAt: "2026-10-22T12:03:01.000Z" }; },
    async getMission() { return { missionId: "mission-1", state: "succeeded", createdAt: "2026-10-22T12:03:01.000Z", updatedAt: "2026-10-22T12:04:00.000Z", result: { reportId: "report-1", title: "Review", body: "Looks good", completedAt: "2026-10-22T12:04:00.000Z" } }; },
  };
  const bridge = new AgentBridge([{ id: "vision", displayName: "VISION", enabled: true }], contextResolver, missionGateway, missionStore, relationStore, access, () => new Date("2026-10-22T12:03:02.000Z"));
  const invocation = { ownerId: "owner-1", actorId: "user-1", agentId: "vision", prompt: "Review this PR", source: prRef, idempotencyKey: "request-1" };
  return { bridge, invocation, calls, relationWrites, related, store, missionGateway };
}

test("resolves an authorized PR dossier with provenance, freshness and bounded text diff", async () => {
  const { bridge, invocation, calls } = setup();
  const receipt = await bridge.invoke(invocation);
  assert.equal(receipt.missionId, "mission-1");
  assert.equal(calls.length, 1);
  const dossier = calls[0].context;
  assert.equal(dossier.title, pr.title);
  assert.equal(dossier.provenance[0].freshness, "fresh");
  assert.equal(dossier.attachments[0].kind, "text");
  assert.equal(dossier.attachments[0].name, "diff:src/auth.ts");
  assert.equal(dossier.attachments[0].provenance.accessDecision, "allowed");
});

test("does not create a mission when source access is denied", async () => {
  const { bridge, invocation, calls } = setup({ allowed: false });
  await assert.rejects(bridge.invoke(invocation), (error) => error instanceof AgentLayerError && error.code === "CONTEXT_FORBIDDEN");
  assert.equal(calls.length, 0);
});

test("same idempotency key returns the original mission and a changed payload conflicts", async () => {
  const { bridge, invocation, calls } = setup();
  await bridge.invoke(invocation);
  const repeat = await bridge.invoke(invocation);
  assert.equal(repeat.missionId, "mission-1");
  assert.equal(calls.length, 1);
  await assert.rejects(bridge.invoke({ ...invocation, prompt: "Different task" }), (error) => error.code === "IDEMPOTENCY_CONFLICT");
});

test("refresh follows the real mission gateway and links its report to the source", async () => {
  const { bridge, invocation, relationWrites } = setup();
  await bridge.invoke(invocation);
  const snapshot = await bridge.refresh({ ownerId: "owner-1", missionId: "mission-1" });
  assert.equal(snapshot.result.reportId, "report-1");
  assert.deepEqual(relationWrites.map((relation) => relation.relationType), ["mission_for", "report_for"]);
});

test("unconfigured OpenMausBot transport fails explicitly instead of simulating success", async () => {
  const { bridge, invocation } = setup({ gateway: new UnavailableOpenMausBotGateway() });
  await assert.rejects(bridge.invoke(invocation), (error) => error instanceof AgentLayerError && error.code === "MISSION_API_UNAVAILABLE");
});
