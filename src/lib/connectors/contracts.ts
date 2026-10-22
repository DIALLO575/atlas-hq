import { createHash } from "node:crypto";

export type ProviderId = "github" | "linear";
export type CapabilityState = "enabled" | "disabled" | "unknown";
export type ConnectionState = "connected" | "reauthorization_required" | "disconnected" | "error";
export type CommandState = "prepared" | "submitted" | "confirmed" | "failed" | "unknown_outcome";
export type FreshnessState = "fresh" | "stale" | "unknown";
export type ConnectorErrorCode =
  | "AUTH_REQUIRED"
  | "PERMISSION_DENIED"
  | "NOT_FOUND_OR_HIDDEN"
  | "RATE_LIMITED"
  | "VALIDATION_FAILED"
  | "CONFLICT"
  | "PROVIDER_UNAVAILABLE"
  | "TIMEOUT_UNKNOWN_OUTCOME"
  | "UNSUPPORTED_CAPABILITY";

/** Public connection metadata only. Secret material is resolved server-side from secretRef. */
export interface ConnectorConnection {
  id: string;
  ownerId: string;
  provider: ProviderId;
  accountId: string;
  accountLabel: string;
  workspaceId?: string;
  state: ConnectionState;
  grantedScopes: string[];
  secretRef?: string;
  checkedAt?: string;
}

export interface IntegrationAccount {
  id: string;
  ownerId: string;
  provider: ProviderId;
  providerAccountId: string;
  displayName: string;
}

export interface IntegrationWorkspace {
  id: string;
  accountId: string;
  providerWorkspaceId: string;
  displayName: string;
}

export interface ResourceRelation {
  connectionId: string;
  fromType: string;
  fromProviderObjectId: string;
  relationType: string;
  toType: string;
  toProviderObjectId: string;
  canonicalUrl?: string;
  observedAt: string;
}

export interface Capability {
  id: string;
  state: CapabilityState;
  evidence: "adapter_contract" | "live_auth_check" | "provider_documentation" | "not_verified";
  checkedAt?: string;
  requiredScopes?: string[];
  reason?: string;
}

export interface NormalizedResource {
  connectionId: string;
  provider: ProviderId;
  objectType: string;
  providerObjectId: string;
  title: string;
  summary?: string;
  canonicalUrl?: string;
  sourceUpdatedAt?: string;
  observedAt: string;
  freshness?: FreshnessState;
  lastErrorCode?: ConnectorErrorCode;
  providerData?: Record<string, unknown>;
}

export interface SyncCheckpoint {
  connectionId: string;
  collection: string;
  cursor?: string;
  lastAttemptAt?: string;
  lastSuccessAt?: string;
  lagSeconds?: number;
  lastErrorCode?: ConnectorErrorCode;
}

export interface ProviderChange {
  connectionId: string;
  eventId?: string;
  objectType: string;
  providerObjectId: string;
  changeType: "created" | "updated" | "deleted" | "unknown";
  sourceUpdatedAt?: string;
  observedAt: string;
}

export interface WebhookEnvelope {
  connectionId: string;
  providerEventId: string;
  eventType: string;
  receivedAt: string;
  signatureValid: boolean;
  processingState: "received" | "processing" | "processed" | "rejected";
  payloadDigest: string;
}

export interface AuditRecord {
  actorId: string;
  connectionId: string;
  operation: string;
  targetType?: string;
  targetId?: string;
  payloadHash?: string;
  approvalState?: "not_required" | "pending" | "approved" | "rejected";
  commandState?: CommandState;
  providerReceiptId?: string;
  verificationState?: "pending" | "verified" | "mismatch" | "unknown";
  occurredAt: string;
}

export interface ServerSecretResolver {
  resolve(input: { ownerId: string; connectionId: string; secretRef: string }): Promise<string>;
  revoke(input: { ownerId: string; connectionId: string; secretRef: string }): Promise<void>;
}

export interface Page<T> {
  items: T[];
  nextCursor?: string;
}

export interface IssueCreateInput {
  title: string;
  body?: string;
  labels?: string[];
}

export interface PreparedCommand<T> {
  connectionId: string;
  operation: string;
  input: T;
  payloadHash: string;
  requiredScopes: string[];
  approvalRequired: true;
  preparedAt: string;
}

export interface ProviderReceipt {
  providerObjectId: string;
  canonicalUrl?: string;
  acceptedAt: string;
}

export type IdempotencyReservation =
  | { state: "reserved" }
  | { state: "completed"; receipt: ProviderReceipt }
  | { state: "conflict" }
  | { state: "in_progress" | "unknown_outcome" };

/** Must be implemented by a durable, uniquely constrained server-side store before production writes. */
export interface IdempotencyStore {
  reserve(key: string, payloadHash: string): Promise<IdempotencyReservation>;
  complete(key: string, receipt: ProviderReceipt): Promise<void>;
  markUnknown(key: string, reason: string): Promise<void>;
}

export interface ConnectorAdapter {
  readonly provider: ProviderId;
  describe(connection: ConnectorConnection): Capability[];
  health(connection: ConnectorConnection): Promise<{ state: ConnectionState; checkedAt: string }>;
  searchIssues(connection: ConnectorConnection, query: string, cursor?: string): Promise<Page<NormalizedResource>>;
  getIssue(connection: ConnectorConnection, providerObjectId: string): Promise<NormalizedResource>;
  prepareCreateIssue(connection: ConnectorConnection, input: IssueCreateInput): PreparedCommand<IssueCreateInput>;
  sync?(connection: ConnectorConnection, checkpoint?: SyncCheckpoint): Promise<{ changes: ProviderChange[]; checkpoint: SyncCheckpoint }>;
  verify?(connection: ConnectorConnection, receipt: ProviderReceipt): Promise<NormalizedResource>;
}

export class ConnectorError extends Error {
  readonly code: ConnectorErrorCode;
  readonly retryAfterSeconds?: number;

  constructor(code: ConnectorErrorCode, message: string, retryAfterSeconds?: number) {
    super(message);
    this.code = code;
    this.retryAfterSeconds = retryAfterSeconds;
    this.name = "ConnectorError";
  }
}

export function payloadHash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export function assertCanUseConnection(connection: ConnectorConnection, provider: ProviderId): void {
  if (connection.provider !== provider) throw new ConnectorError("VALIDATION_FAILED", "Provider mismatch");
  if (connection.state !== "connected" || !connection.secretRef) {
    throw new ConnectorError("AUTH_REQUIRED", "Connection requires server-side authentication");
  }
}
