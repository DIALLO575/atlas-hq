/**
 * SHA-177 — OFFLINE ONLY n8n webhook/callback protocol contracts.
 *
 * This module NEVER sends HTTP, accepts a network request, writes a receipt,
 * marks a workflow complete, retries a timeout or enqueues an Engine run.
 * The shared n8n release gate in engine-core remains HTTP 423.
 *
 * n8n does not automatically HMAC-sign all webhook callbacks. A future
 * controlled n8n workflow/relay must explicitly implement this ATLAS protocol;
 * this is NOT advertised as a native n8n authentication feature.
 */
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { planN8nCapability, validateN8nRemoteId } from "./contracts.mjs";
import { n8nReleasePermission } from "../../../engine-core/src/release-gates.mjs";

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const DIGEST = /^[a-f0-9]{64}$/;
const NONCE = /^[A-Za-z0-9_-]{24,96}$/;
const KEY_ID = /^[a-z][a-z0-9_-]{0,31}$/;
const STATUS = Object.freeze(["new", "running", "waiting", "success", "error", "canceled"]);
const TERMINAL = new Set(["success", "error", "canceled"]);
const MAX_BODY_BYTES = 4096;
const MAX_CLOCK_SKEW_SECONDS = 300;
const isRecord = v => v !== null && typeof v === "object" && !Array.isArray(v);
const isUuid = v => typeof v === "string" && UUID.test(v);
const iso = v => typeof v === "string" && v.length <= 40 &&
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(v) && Number.isFinite(Date.parse(v));
const failure = code => { throw new N8nWebhookProtocolError(code); };
export class N8nWebhookProtocolError extends Error {
  constructor(code) {
    super(code);
    this.name = "N8nWebhookProtocolError";
    this.code = code;
    this.status = 400;
  }
}
function exact(value, allowed) {
  if (!isRecord(value) || Object.keys(value).some(key => !allowed.includes(key)) ||
      allowed.some(key => !Object.hasOwn(value, key))) failure("N8N_WEBHOOK_SHAPE_INVALID");
}

/**
 * An intent plan cannot select a caller-provided URL, transport, credential,
 * source actor or approval. A digest is NOT a persisted human approval.
 */
export function planN8nWebhookDispatch(input) {
  exact(input, ["workspaceId", "instanceId", "workflowId", "intentDigest", "idempotencyKey"]);
  if (!isUuid(input.workspaceId) || !isUuid(input.instanceId) ||
      !isUuid(input.workflowId) || !isUuid(input.idempotencyKey) ||
      typeof input.intentDigest !== "string" || !DIGEST.test(input.intentDigest))
    failure("N8N_WEBHOOK_INTENT_INVALID");
  const capability = planN8nCapability({
    workspaceId: input.workspaceId, instanceId: input.instanceId,
    capability: "workflows.invoke", workflowId: "atlas-registry-binding-pending",
    intentDigest: input.intentDigest,
  });
  const gate = n8nReleasePermission({}, "execute");
  if (gate.allowed !== false || capability.canEnqueue !== false || capability.canDispatch !== false)
    failure("N8N_WEBHOOK_RELEASE_INVARIANT_FAILED");
  return Object.freeze({
    kind: "n8n-webhook-dispatch-draft", workspaceId: input.workspaceId,
    instanceId: input.instanceId, workflowId: input.workflowId,
    capability: capability.capability, transport: "webhook", mode: "execute",
    intentDigest: input.intentDigest, idempotencyKey: input.idempotencyKey,
    requiresApprovedImmutableIntent: true, requiresAuthoritativeProviderBinding: true,
    requiresCommonDurableOutbox: true, requiresSessionAndGrantRecheck: true,
    requiresEgressCertification: true, requiresHumanApproval: true,
    releaseCode: gate.code, canEnqueue: false, canDispatch: false,
  });
}

/** An HTTP ACK is not proof of a completed n8n execution or of exactly-once delivery. */
export function assessN8nWebhookAttempt(input) {
  exact(input, ["httpStatus", "networkError"]);
  if (typeof input.networkError !== "boolean" ||
      (input.httpStatus !== null && (!Number.isSafeInteger(input.httpStatus) ||
        input.httpStatus < 100 || input.httpStatus > 599)))
    failure("N8N_WEBHOOK_RESULT_INVALID");
  if (input.networkError) {
    if (input.httpStatus !== null) failure("N8N_WEBHOOK_RESULT_INVALID");
    return Object.freeze({ state: "unknown", effectMayHaveOccurred: true,
      retryAutomatically: false, canDispatch: false, requiresReconciliation: true });
  }
  if (input.httpStatus === null) failure("N8N_WEBHOOK_RESULT_INVALID");
  if (input.httpStatus >= 200 && input.httpStatus < 300) {
    return Object.freeze({ state: "acknowledged", effectMayHaveOccurred: true,
      retryAutomatically: false, canDispatch: false, requiresReconciliation: true });
  }
  // Upstream may have accepted the work before emitting an error. Do not retry.
  return Object.freeze({ state: input.httpStatus === 401 || input.httpStatus === 403
    ? "rejected" : "unknown", effectMayHaveOccurred: input.httpStatus !== 401 && input.httpStatus !== 403,
    retryAutomatically: false, canDispatch: false, requiresReconciliation: true });
}

/**
 * Verify an ATLAS-specific HMAC envelope using raw HTTP body bytes.
 * Caller MUST obtain secret from a server-side, instance-bound provider and
 * reject duplicate/mixed headers BEFORE calling this function.
 * A valid MAC alone proves neither grant nor idempotency, nor eligibility for
 * persistence. It never bypasses the runtime gate or writes to Supabase.
 */
export function verifyN8nCallbackEnvelope(input) {
  exact(input, ["rawBody", "headers", "secret", "nowSeconds"]);
  if (!Buffer.isBuffer(input.secret) || input.secret.byteLength < 32 ||
      input.secret.byteLength > 512) failure("N8N_CALLBACK_KEY_UNAVAILABLE");
  if (!(Buffer.isBuffer(input.rawBody) || input.rawBody instanceof Uint8Array) ||
      input.rawBody.byteLength < 2 || input.rawBody.byteLength > MAX_BODY_BYTES)
    failure("N8N_CALLBACK_BODY_INVALID");
  if (!Number.isSafeInteger(input.nowSeconds) || input.nowSeconds < 0)
    failure("N8N_CALLBACK_CLOCK_INVALID");
  exact(input.headers, ["timestamp", "nonce", "keyId", "signature"]);
  const { timestamp, nonce, keyId, signature } = input.headers;
  if (typeof timestamp !== "string" || !/^[1-9][0-9]{9,11}$/.test(timestamp) ||
      !Number.isSafeInteger(Number(timestamp)) ||
      Math.abs(input.nowSeconds - Number(timestamp)) > MAX_CLOCK_SKEW_SECONDS)
    failure("N8N_CALLBACK_TIMESTAMP_INVALID");
  if (typeof nonce !== "string" || !NONCE.test(nonce) ||
      typeof keyId !== "string" || !KEY_ID.test(keyId) ||
      typeof signature !== "string" || !DIGEST.test(signature))
    failure("N8N_CALLBACK_HEADERS_INVALID");
  const bytes = Buffer.from(input.rawBody);
  const digest = createHash("sha256").update(bytes).digest("hex");
  const message = ["atlas-n8n-callback-v1", timestamp, nonce, keyId, digest].join("\n");
  const expected = createHmac("sha256", input.secret).update(message, "utf8").digest();
  const incoming = Buffer.from(signature, "hex");
  if (incoming.length !== expected.length || !timingSafeEqual(expected, incoming))
    failure("N8N_CALLBACK_AUTHENTICATION_FAILED");
  let payload;
  try {
    payload = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch { failure("N8N_CALLBACK_BODY_INVALID"); }
  exact(payload, ["version", "workspaceId", "instanceId", "executionId",
    "remoteExecutionId", "status", "occurredAt"]);
  if (payload.version !== 1 || !isUuid(payload.workspaceId) ||
      !isUuid(payload.instanceId) || !isUuid(payload.executionId) ||
      !STATUS.includes(payload.status) || !iso(payload.occurredAt))
    failure("N8N_CALLBACK_PAYLOAD_INVALID");
  try { validateN8nRemoteId(payload.remoteExecutionId); }
  catch { failure("N8N_CALLBACK_PAYLOAD_INVALID"); }
  const gate = n8nReleasePermission({}, "execute");
  if (gate.allowed !== false) failure("N8N_CALLBACK_RELEASE_INVARIANT_FAILED");
  return Object.freeze({
    kind: "n8n-verified-callback-draft", workspaceId: payload.workspaceId,
    instanceId: payload.instanceId, executionId: payload.executionId,
    remoteExecutionId: payload.remoteExecutionId,
    status: payload.status, occurredAt: payload.occurredAt, nonce, keyId,
    bodySha256: digest, verifiedMac: true, requiresAtomicReceipt: true,
    requiresTrustedInstanceAndExecutionLookup: true, requiresIdempotencyAndStatusCas: true,
    canPersist: false, canApply: false, canDispatch: false,
  });
}

/**
 * Pure transition proposal. A callback is NOT authorized to update a status.
 * A future privileged worker must lock the matching execution, check its
 * workspace+instance+remote ID and atomically insert the receipt and CAS the
 * version. This module never contacts a provider or a database.
 */
export function planN8nCallbackTransition(input) {
  exact(input, ["verified", "stored"]);
  const { verified, stored } = input;
  if (!isRecord(verified) || verified.kind !== "n8n-verified-callback-draft" ||
      verified.verifiedMac !== true || verified.canApply !== false ||
      !isUuid(verified.workspaceId) || !isUuid(verified.instanceId) ||
      !isUuid(verified.executionId) || !STATUS.includes(verified.status) ||
      !NONCE.test(verified.nonce ?? "") ||
      !isRecord(stored) || !isUuid(stored.workspace_id) ||
      !isUuid(stored.instance_id) || !isUuid(stored.id) ||
      stored.workspace_id !== verified.workspaceId ||
      stored.instance_id !== verified.instanceId ||
      stored.id !== verified.executionId ||
      stored.remote_execution_id !== verified.remoteExecutionId ||
      !["unknown", ...STATUS].includes(stored.status) ||
      !Number.isSafeInteger(stored.event_version) || stored.event_version < 0 ||
      !(stored.last_seen_at === null || iso(stored.last_seen_at)))
    failure("N8N_CALLBACK_TARGET_INVALID");
  const newer = stored.last_seen_at === null ||
    Date.parse(verified.occurredAt) >= Date.parse(stored.last_seen_at);
  let resolution = "propose", nextStatus = verified.status;
  if (stored.status === verified.status) {
    resolution = "duplicate-state"; nextStatus = null;
  } else if (TERMINAL.has(stored.status)) {
    resolution = "terminal-conflict"; nextStatus = null;
  } else if (!newer) {
    resolution = "late-event"; nextStatus = null;
  } else if (stored.status === "waiting" && verified.status === "new") {
    resolution = "late-event"; nextStatus = null;
  } else if (stored.status === "running" && verified.status === "new") {
    resolution = "late-event"; nextStatus = null;
  }
  return Object.freeze({
    kind: "n8n-callback-transition-draft", resolution, nextStatus,
    expectedEventVersion: stored.event_version,
    proposedEventVersion: nextStatus === null ? null : stored.event_version + 1,
    requiresAtomicReceipt: true, requiresTransactionLockAndCas: true,
    requiresTrustedWorker: true, canApply: false, canDispatch: false,
  });
}
