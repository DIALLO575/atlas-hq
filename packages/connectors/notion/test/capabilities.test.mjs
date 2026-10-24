import test from "node:test";
import assert from "node:assert/strict";
import { effectiveNotionCapabilities } from "../src/capabilities.mjs";

test("never infers provider authorization from implemented tools alone", () => {
  assert.equal(effectiveNotionCapabilities()["pages.read"], false);
  assert.equal(effectiveNotionCapabilities({ connected: true, grants: [] })["pages.read"], false);
  const cap = effectiveNotionCapabilities({ connected: true, grants: ["read_content"] });
  assert.equal(cap["pages.read"], true);
  assert.equal(cap["agents.mcp"], false);
  assert.equal(cap["pages.update"], false);
});
