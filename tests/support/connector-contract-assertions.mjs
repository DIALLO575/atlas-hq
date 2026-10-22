import assert from "node:assert/strict";

const CAPABILITY_STATES = new Set(["enabled", "disabled", "unknown"]);
const CAPABILITY_EVIDENCE = new Set([
  "adapter_contract",
  "live_auth_check",
  "provider_documentation",
  "not_verified",
]);

/** Shared assertions for every provider adapter's offline contract suite. */
export function assertCapabilityManifest(adapter, connection) {
  const capabilities = adapter.describe(connection);
  assert.ok(capabilities.length > 0, "each connector declares its capability surface");

  for (const capability of capabilities) {
    assert.equal(typeof capability.id, "string");
    assert.ok(CAPABILITY_STATES.has(capability.state), `valid state for ${capability.id}`);
    assert.ok(CAPABILITY_EVIDENCE.has(capability.evidence), `valid evidence for ${capability.id}`);
    if (capability.state === "enabled") {
      assert.ok(capability.evidence !== "not_verified", `${capability.id} cannot be enabled without evidence`);
    }
    assert.ok(!JSON.stringify(capability).includes("mock-secret"), "capabilities never expose credentials");
  }

  return capabilities;
}

/** Ensures normalized objects remain scoped and contain provider timestamps. */
export function assertScopedNormalizedResource(resource, { connectionId, provider }) {
  assert.equal(resource.connectionId, connectionId);
  assert.equal(resource.provider, provider);
  assert.ok(resource.objectType);
  assert.ok(resource.providerObjectId);
  assert.ok(resource.title);
  assert.ok(Number.isFinite(Date.parse(resource.observedAt)), "observedAt is a valid timestamp");
  if (resource.sourceUpdatedAt) {
    assert.ok(Number.isFinite(Date.parse(resource.sourceUpdatedAt)), "sourceUpdatedAt is valid when supplied");
  }
  assert.ok(!JSON.stringify(resource).includes("mock-secret"), "normalized resources never expose credentials");
}
