import test from "node:test";
import assert from "node:assert/strict";
import {
  N8nContractError, N8N_CAPABILITIES, N8N_TRANSPORTS, N8N_MODES,
  validateN8nRemoteId, planN8nCapability, summarizeN8nDiscovery,
} from "../packages/engines/n8n/src/contracts.mjs";

const ws = "123e4567-e89b-42d3-a456-426614174000";
const instance = "123e4567-e89b-42d3-a456-426614174001";
const digest = "a".repeat(64);
const plan = (capability, extra = {}) => planN8nCapability({ workspaceId: ws, instanceId: instance, capability, ...extra });
const fails = (code) => (error) => error instanceof N8nContractError && error.code === code;

// The contract is deliberately not a live transport or provider API.
test("all advertised contract capabilities are unique, frozen and offline", () => {
  assert.deepEqual(N8N_TRANSPORTS, ["rest", "mcp", "webhook"]);
  assert.deepEqual(N8N_MODES, ["read", "write", "execute"]);
  assert.equal(N8N_CAPABILITIES.length, 13);
  assert.equal(new Set(N8N_CAPABILITIES.map((def) => def.id)).size, N8N_CAPABILITIES.length);
  for (const def of N8N_CAPABILITIES) {
    assert.ok(Object.isFrozen(def));
    assert.equal(def.available, false);
    assert.equal(def.callable, false);
    assert.equal(def.requiresHumanApproval, def.mode !== "read");
  }
  assert.ok(Object.isFrozen(N8N_CAPABILITIES));
});

test("each operation selects one transport and NEVER grants execution", () => {
  for (const capability of N8N_CAPABILITIES) {
    const scope = capability.scope === "instance" ? {} : { workflowId: "abc_1" };
    if (capability.scope === "execution") scope.executionId = "123";
    if (capability.mode !== "read") scope.intentDigest = digest;
    const value = plan(capability.id, scope);
    assert.equal(value.transport, capability.transport);
    assert.equal(value.mode, capability.mode);
    assert.equal(value.requiresHumanApproval, capability.mode !== "read");
    assert.equal(value.canDispatch, false);
    assert.equal(value.canEnqueue, false);
    assert.equal(value.available, false);
    assert.equal(value.requiresVerifiedActor, true);
    assert.equal(value.requiresWorkspaceGrant, true);
    assert.equal(value.requiresTrustedInstanceBinding, true);
    assert.equal(value.requiresRuntimeCapabilityVerification, true);
    assert.ok(Object.isFrozen(value));
  }
  assert.equal(plan("workflows.invoke", {workflowId: "a-b", intentDigest: digest}).transport, "webhook");
  assert.equal(plan("workflows.invoke_as_tool", {workflowId: "a-b", intentDigest: digest}).transport, "mcp");
  assert.equal(plan("workflows.import", {intentDigest: digest}).transport, "rest");
  assert.equal(plan("workflows.ai.create", {intentDigest: digest}).transport, "mcp");
});

test("unknown or attacker-provided capability/transport/permission fails closed", () => {
  assert.throws(() => plan("root.execute"), fails("N8N_CAPABILITY_UNKNOWN"));
  assert.throws(() => plan("workflows.list", { transport: "mcp" }), fails("N8N_TRANSPORT_MISMATCH"));
  for (const field of ["apiKey", "token", "url", "host", "approved", "allow", "enabled", "actorId", "permission", "headers", "mode"]) {
    assert.throws(() => plan("workflows.list", { [field]: "ATTACKER" }), fails("N8N_FIELD_FORBIDDEN"));
  }
  assert.throws(() => planN8nCapability({workspaceId:ws, instanceId:instance}), fails("N8N_FIELD_MISSING"));
  assert.throws(() => planN8nCapability(null), fails("N8N_INPUT_INVALID"));
  assert.throws(() => planN8nCapability([]), fails("N8N_INPUT_INVALID"));
});

test("requires exact Atlas UUID tenancy and separate opaque remote IDs", () => {
  for (const id of ["", "not-a-uuid", "00000000-0000-0000-0000-000000000000", "../../admin"]) {
    assert.throws(() => planN8nCapability({ workspaceId: id, instanceId: instance, capability: "workflows.list" }), fails("N8N_SCOPE_INVALID"));
  }
  for (const bad of [null, 42, "../foo", "a/b", "x?apiKey=y", "https://n8n.example/a", " a", "a%2Fb", "a".repeat(129)]) {
    assert.throws(() => validateN8nRemoteId(bad), fails("N8N_REMOTE_ID_INVALID"));
  }
  assert.equal(validateN8nRemoteId("-Ab12_"), "-Ab12_");
  assert.throws(() => plan("workflows.get"), fails("N8N_REMOTE_ID_INVALID"));
  assert.throws(() => plan("executions.get", { workflowId: "w1" }), fails("N8N_REMOTE_ID_INVALID"));
  assert.throws(() => plan("workflows.list", { workflowId: "w1" }), fails("N8N_SCOPE_UNEXPECTED"));
  assert.throws(() => plan("workflows.get", { workflowId: "w1", executionId: "22" }), fails("N8N_SCOPE_UNEXPECTED"));
});

test("writes and executions require immutable intent digests, never a boolean approval", () => {
  assert.throws(() => plan("workflows.publish", { workflowId: "w1" }), fails("N8N_INTENT_DIGEST_REQUIRED"));
  assert.throws(() => plan("workflows.invoke", { workflowId: "w1", intentDigest: "yes" }), fails("N8N_INTENT_DIGEST_REQUIRED"));
  assert.throws(() => plan("workflows.get", { workflowId: "w1", intentDigest: digest }), fails("N8N_INTENT_UNEXPECTED"));
  const result = plan("workflows.publish", {workflowId: "w1", intentDigest: digest});
  assert.equal(result.intentDigest, digest);
  assert.equal(result.requiresHumanApproval, true);
  assert.equal(result.canDispatch, false);
});

test("discovery is untrusted, bounded and never authorizes provider calls", () => {
  const items = summarizeN8nDiscovery({ transport: "mcp", reportedCapabilities: ["workflows.ai.create", "workflows.publish", "root.execute"] });
  assert.equal(items.find((item) => item.capability === "workflows.ai.create").advertised, true);
  assert.equal(items.find((item) => item.capability === "tools.discover").advertised, false);
  assert.equal(items.some((item) => item.capability === "workflows.list"), false);
  assert.ok(items.every((item) => item.available === false && item.callable === false && item.authorizationVerified === false));
  assert.ok(Object.isFrozen(items));
  assert.throws(() => summarizeN8nDiscovery({ transport: "stdio", reportedCapabilities: [] }), fails("N8N_TRANSPORT_UNKNOWN"));
  assert.throws(() => summarizeN8nDiscovery({ transport: "mcp", reportedCapabilities: Array(101).fill("foo") }), fails("N8N_DISCOVERY_INVALID"));
  assert.throws(() => summarizeN8nDiscovery({ transport: "mcp", reportedCapabilities: [42] }), fails("N8N_DISCOVERY_INVALID"));
  assert.throws(() => summarizeN8nDiscovery({ transport: "mcp", reportedCapabilities: [], token: "secret" }), fails("N8N_FIELD_FORBIDDEN"));
});

test("offline plans project no raw provider data, secrets or remote URLs", () => {
  const safe = plan("executions.get", { workflowId: "w1", executionId: "987" });
  assert.deepEqual(Object.keys(safe).filter((name) => /url|key|token|secret|credential|result|prompt|payload/i.test(name)), []);
  assert.deepEqual({ workflowId: safe.workflowId, executionId: safe.executionId }, { workflowId: "w1", executionId: "987" });
});
