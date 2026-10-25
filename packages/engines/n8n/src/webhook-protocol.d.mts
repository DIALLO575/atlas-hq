export class N8nWebhookProtocolError extends Error {
  constructor(code: string);
  code: string;
  status: number;
}
export type N8nWebhookDispatchDraft = Readonly<{
  kind: "n8n-webhook-dispatch-draft";
  workspaceId: string; instanceId: string; workflowId: string;
  capability: "workflows.invoke"; transport: "webhook"; mode: "execute";
  intentDigest: string; idempotencyKey: string;
  requiresApprovedImmutableIntent: true;
  requiresAuthoritativeProviderBinding: true;
  requiresCommonDurableOutbox: true;
  requiresSessionAndGrantRecheck: true;
  requiresEgressCertification: true;
  requiresHumanApproval: true;
  releaseCode: string; canEnqueue: false; canDispatch: false;
}>;
export function planN8nWebhookDispatch(input: {
  workspaceId: string; instanceId: string; workflowId: string;
  intentDigest: string; idempotencyKey: string;
}): N8nWebhookDispatchDraft;
export type N8nWebhookAttempt = Readonly<{
  state: "unknown" | "rejected" | "acknowledged";
  effectMayHaveOccurred: boolean; retryAutomatically: false;
  canDispatch: false; requiresReconciliation: true;
}>;
export function assessN8nWebhookAttempt(input: {
  httpStatus: number | null; networkError: boolean;
}): N8nWebhookAttempt;
export type N8nVerifiedCallbackDraft = Readonly<{
  kind: "n8n-verified-callback-draft";
  workspaceId: string; instanceId: string; executionId: string;
  remoteExecutionId: string; status: string; occurredAt: string;
  nonce: string; keyId: string; bodySha256: string;
  verifiedMac: true; requiresAtomicReceipt: true;
  requiresTrustedInstanceAndExecutionLookup: true;
  requiresIdempotencyAndStatusCas: true;
  canPersist: false; canApply: false; canDispatch: false;
}>;
export function verifyN8nCallbackEnvelope(input: {
  rawBody: Buffer | Uint8Array;
  headers: {timestamp: string; nonce: string; keyId: string; signature: string};
  secret: Buffer; nowSeconds: number;
}): N8nVerifiedCallbackDraft;
export type N8nCallbackTransitionDraft = Readonly<{
  kind: "n8n-callback-transition-draft";
  resolution: "propose" | "duplicate-state" | "terminal-conflict" | "late-event";
  nextStatus: string | null; expectedEventVersion: number;
  proposedEventVersion: number | null;
  requiresAtomicReceipt: true; requiresTransactionLockAndCas: true;
  requiresTrustedWorker: true; canApply: false; canDispatch: false;
}>;
export function planN8nCallbackTransition(input: {
  verified: N8nVerifiedCallbackDraft;
  stored: {
    id: string; workspace_id: string; instance_id: string;
    remote_execution_id: string; status: string;
    event_version: number; last_seen_at: string | null;
  };
}): N8nCallbackTransitionDraft;
