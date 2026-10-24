import test from "node:test";
import assert from "node:assert/strict";
import {
  notionResourceRef, matchesNotionResourceRef, notionResourceOperation,
} from "../src/resource-reference.mjs";
const uuid = (n) => n.repeat(8) + "-" + n.repeat(4) + "-4" + n.repeat(3) +
  "-8" + n.repeat(3) + "-" + n.repeat(12);
const ids = {
  workspaceId: uuid("a"), actorId: uuid("1"), connectionId: uuid("2"),
  notionWorkspaceId: uuid("3"), resourceId: uuid("4"),
};
const binding = { ...ids, surface: "rest", credential: "notion_rest_oauth", active: true };
const t = 1792855000000;
const page = {
  kind: "page", resourceId: ids.resourceId, connectionBinding: binding,
  providerResponse: { object: "page", id: ids.resourceId,
    last_edited_time: "2026-10-24T14:02:03.000Z",
    properties: { Secret: "NEVER_SERIALIZE" } }, checkedAt: t,
};

test("Notion ResourceRef stores only provenance, version, kind and binding", () => {
  const ref = notionResourceRef(page);
  assert.equal(ref.sourceVersion, "2026-10-24T14:02:03.000Z");
  assert.equal(ref.resourceId, ids.resourceId.replaceAll("-", ""));
  assert.equal(ref.kind, "page");
  assert.equal(JSON.stringify(ref).includes("NEVER_SERIALIZE"), false);
  assert.equal(Object.isFrozen(ref), true);
  assert.equal(notionResourceOperation("page"), "rest.pages.retrieve");
});
test("rejects provider object/id substitution and disconnected or MCP binding", () => {
  for (const change of [
    { providerResponse: { object: "block", id: ids.resourceId } },
    { providerResponse: { object: "page", id: uuid("5") } },
    { connectionBinding: { ...binding, active: false } },
    { connectionBinding: { ...binding, surface: "mcp" } },
    { connectionBinding: { ...binding, credential: "notion_mcp_oauth" } },
    { providerResponse: { object: "page", id: ids.resourceId,
      last_edited_time: "not-a-date" } },
  ]) assert.throws(() => notionResourceRef({ ...page, ...change }), /NOTION_RESOURCE_/);
});
test("resource ref matches only exact actor, workspace, credential and resource", () => {
  const ref = notionResourceRef(page);
  assert.equal(matchesNotionResourceRef(ref, binding, "page", ids.resourceId), true);
  for (const key of ["workspaceId", "actorId", "connectionId", "notionWorkspaceId"]) {
    assert.equal(matchesNotionResourceRef(ref,
      { ...binding, [key]: uuid("6") }, "page", ids.resourceId), false);
  }
  assert.equal(matchesNotionResourceRef(ref, binding, "block", ids.resourceId), false);
  assert.equal(matchesNotionResourceRef(ref, binding, "page", uuid("7")), false);
  assert.equal(matchesNotionResourceRef(ref, { ...binding, active: false },
    "page", ids.resourceId), false);
});
