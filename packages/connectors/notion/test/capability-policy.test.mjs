import test from "node:test";
import assert from "node:assert/strict";
import {
  NOTION_CAPABILITY_MANIFEST, NOTION_REST_API_VERSION,
  evaluateNotionCapabilities, notionCapabilityEvidence,
} from "../src/capability-policy.mjs";

const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const binding = {
  workspaceId: id, actorId: "11111111-1111-4111-8111-111111111111",
  connectionId: "22222222-2222-4222-8222-222222222222",
  notionWorkspaceId: "33333333-3333-4333-8333-333333333333",
  surface: "rest", credential: "notion_rest_oauth", active: true,
};
const time = 1792845000000;
const get = (snapshot, operation) => snapshot.capabilities.find(x => x.id === operation);
const settings = { rest: true, mcp: true, webhooks: true, admin: true };

test("manifest lists distinct REST, webhook, MCP, agent, worker, admin credentials", () => {
  assert.equal(new Set(NOTION_CAPABILITY_MANIFEST.map(x => x.id)).size,
    NOTION_CAPABILITY_MANIFEST.length);
  assert.equal(NOTION_REST_API_VERSION, "2026-03-11");
  assert.equal(NOTION_CAPABILITY_MANIFEST.find(x => x.id === "rest.search.title")
    .description.includes("titles only"), true);
  assert.notEqual(NOTION_CAPABILITY_MANIFEST.find(x => x.surface === "rest").credential,
    NOTION_CAPABILITY_MANIFEST.find(x => x.surface === "mcp").credential);
});

test("no provider authorization inferred from implementation or configuration alone", () => {
  const empty = evaluateNotionCapabilities({ checkedAt: time });
  assert.equal(get(empty, "rest.search.title").status, "built");
  assert.equal(get(empty, "rest.search.title").available, false);
  const configured = evaluateNotionCapabilities({ configuredSurfaces: settings, checkedAt: time });
  assert.equal(get(configured, "rest.search.title").status, "configured");
  assert.equal(get(configured, "rest.search.title").available, false);
  assert.equal(get(configured, "mcp.tools.list").status, "not_implemented");
});

test("active verified ATLAS binding is not proof of any Notion content permission", () => {
  const result = evaluateNotionCapabilities({
    configuredSurfaces: settings, connectionBinding: binding, checkedAt: time,
  });
  assert.equal(get(result, "rest.pages.retrieve").status, "authorized");
  assert.equal(get(result, "rest.pages.retrieve").available, false);
  assert.equal(get(result, "rest.search.title").available, false);
  assert.equal(get(result, "rest.pages.create").status, "not_implemented");
  assert.equal(get(result, "rest.pages.create").requiresApproval, true);
});

test("specific live evidence enables ONLY the operation actually verified", () => {
  const evidence = notionCapabilityEvidence({
    operation: "rest.search.title", connectionBinding: binding, checkedAt: time - 2000,
  });
  const result = evaluateNotionCapabilities({
    configuredSurfaces: settings, connectionBinding: binding,
    providerEvidence: [evidence], checkedAt: time,
  });
  assert.equal(get(result, "rest.search.title").status, "provider_verified");
  assert.equal(get(result, "rest.search.title").available, true);
  assert.equal(get(result, "rest.pages.retrieve").available, false);
  assert.equal(get(result, "rest.users.me").available, false);
  assert.equal(get(result, "mcp.tools.list").available, false);
});

test("rejects cross-actor, cross-workspace, cross-connection and expired proofs", () => {
  const proof = notionCapabilityEvidence({
    operation: "rest.search.title", connectionBinding: binding, checkedAt: time - 10,
  });
  const permutations = [
    { ...proof, actorId: "44444444-4444-4444-8444-444444444444" },
    { ...proof, workspaceId: "44444444-4444-4444-8444-444444444444" },
    { ...proof, connectionId: "44444444-4444-4444-8444-444444444444" },
    { ...proof, notionWorkspaceId: "44444444-4444-4444-8444-444444444444" },
    { ...proof, source: "browser_assertion" },
    { ...proof, checkedAt: time - 100000 },
    { ...proof, checkedAt: time + 10 },
  ];
  for (const p of permutations) {
    const v = evaluateNotionCapabilities({
      configuredSurfaces: settings, connectionBinding: binding,
      providerEvidence: [p], checkedAt: time,
    });
    assert.equal(get(v, "rest.search.title").available, false);
  }
});

test("OAuth REST cannot elevate MCP/admin/agents and revoked binding stays fail-closed", () => {
  const proof = notionCapabilityEvidence({
    operation: "rest.search.title", connectionBinding: binding, checkedAt: time,
  });
  for (const b of [{ ...binding, active: false },
    { ...binding, credential: "notion_mcp_oauth" },
    { ...binding, surface: "mcp" }]) {
    const v = evaluateNotionCapabilities({
      configuredSurfaces: settings, connectionBinding: b,
      providerEvidence: [proof], checkedAt: time,
    });
    assert.equal(v.capabilities.every(c => c.available === false), true);
  }
});

test("failed probe degrades one operation; unknown entitlement stays unknown", () => {
  const v = evaluateNotionCapabilities({
    configuredSurfaces: settings, connectionBinding: binding,
    failedOperations: ["rest.search.title"], checkedAt: time,
    planEligibility: { enterprise: true },
  });
  assert.equal(get(v, "rest.search.title").status, "degraded");
  assert.equal(get(v, "rest.pages.retrieve").status, "authorized");
  assert.equal(get(v, "admin.organization").status, "not_implemented");
  assert.equal(get(v, "agents.sessions").planEligible, null);
});

test("cannot manufacture evidence for an unimplemented operation", () => {
  assert.throws(() => notionCapabilityEvidence({
    operation: "rest.pages.update", connectionBinding: binding, checkedAt: time,
  }), /INVALID_NOTION_EVIDENCE/);
});

test("page capability is NEVER globally available from a resource-specific proof", async () => {
  const { notionResourceRef } = await import("../src/resource-reference.mjs");
  const kind = "page";
  const id = "44444444-4444-4444-8444-444444444444";
  const first = notionResourceRef({
    kind, resourceId: id, connectionBinding: binding,
    providerResponse: { object: "page", id }, checkedAt: time,
  });
  const proof = notionCapabilityEvidence({
    operation: "rest.pages.retrieve", connectionBinding: binding,
    resourceRef: first, checkedAt: time,
  });
  const shared = { connectionBinding: binding, configuredSurfaces: settings,
    providerEvidence: [proof], checkedAt: time };
  assert.equal(get(evaluateNotionCapabilities(shared),
    "rest.pages.retrieve").available, false);
  assert.equal(get(evaluateNotionCapabilities({ ...shared, resourceRef: first }),
    "rest.pages.retrieve").available, true);
  const another = notionResourceRef({
    kind, resourceId: "55555555-5555-4555-8555-555555555555",
    connectionBinding: binding,
    providerResponse: { object: "page", id: "55555555-5555-4555-8555-555555555555" },
    checkedAt: time,
  });
  assert.equal(get(evaluateNotionCapabilities({ ...shared, resourceRef: another }),
    "rest.pages.retrieve").available, false);
  assert.throws(() => notionCapabilityEvidence({
    operation: "rest.pages.retrieve", connectionBinding: binding, checkedAt: time,
  }), /NOTION_RESOURCE_EVIDENCE_INVALID/);
  assert.throws(() => notionCapabilityEvidence({
    operation: "rest.search.title", connectionBinding: binding,
    resourceRef: first, checkedAt: time,
  }), /NOTION_RESOURCE_EVIDENCE_INVALID/);
});
