import type { NormalizedResource } from "../connectors/contracts.ts";

export type AgentMissionState =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled"
  | "unknown";

export type AgentLayerErrorCode =
  | "AGENT_NOT_AVAILABLE"
  | "CONTEXT_FORBIDDEN"
  | "CONTEXT_NOT_FOUND"
  | "CONTEXT_UNAVAILABLE"
  | "MISSION_API_UNAVAILABLE"
  | "MISSION_REQUEST_IN_PROGRESS"
  | "MISSION_NOT_FOUND"
  | "IDEMPOTENCY_CONFLICT"
  | "INVALID_REQUEST";

export interface AgentIdentity {
  id: string;
  displayName: string;
  enabled: boolean;
}

export interface AgentInvocation {
  ownerId: string;
  actorId: string;
  agentId: string;
  prompt: string;
  source: ResourceRef;
  idempotencyKey: string;
}

export interface ResourceRef {
  provider: "github" | "linear" | "notion" | "atlas" | "openmausbot";
  objectType: string;
  objectId: string;
  connectionId?: string;
  canonicalUrl?: string;
}

export interface ProvenanceRecord {
  resource: ResourceRef;
  canonicalUrl?: string;
  sourceUpdatedAt?: string;
  observedAt: string;
  freshness: "fresh" | "stale" | "unknown";
  accessDecision: "allowed";
}

export interface ContextAttachment {
  kind: "text" | "document" | "image";
  name: string;
  mimeType: string;
  content: string;
  provenance: ProvenanceRecord;
}

export interface ContextDossier {
  dossierId: string;
  ownerId: string;
  source: ResourceRef;
  title: string;
  summary: string;
  facts: Array<{ label: string; value: string }>;
  relatedResources: NormalizedResource[];
  attachments: ContextAttachment[];
  provenance: ProvenanceRecord[];
  createdAt: string;
}

export interface MissionRequest {
  ownerId: string;
  actorId: string;
  agentId: string;
  prompt: string;
  context: ContextDossier;
  idempotencyKey: string;
}

export interface MissionReceipt {
  missionId: string;
  state: AgentMissionState;
  createdAt: string;
  canonicalUrl?: string;
}

export interface MissionSnapshot extends MissionReceipt {
  updatedAt: string;
  result?: {
    reportId: string;
    title: string;
    body: string;
    canonicalUrl?: string;
    completedAt: string;
  };
  error?: { code: string; message: string };
}

/** The gateway must wrap a documented OpenMausBot mission API. No implementation is shipped until that API is available. */
export interface OpenMausBotMissionGateway {
  createMission(input: MissionRequest): Promise<MissionReceipt>;
  getMission(input: { ownerId: string; missionId: string }): Promise<MissionSnapshot>;
}

export interface MissionRecord {
  ownerId: string;
  actorId: string;
  source: ResourceRef;
  requestKey: string;
  requestHash: string;
  agentId: string;
  missionId?: string;
  state?: AgentMissionState;
  createdAt?: string;
  updatedAt: string;
  canonicalUrl?: string;
  requestState: "creating" | "created" | "failed" | "unknown_outcome";
}

export type MissionReservation =
  | { state: "reserved" }
  | { state: "existing"; record: MissionRecord }
  | { state: "conflict" };

/** Implement with a durable unique constraint on (ownerId, requestKey). */
export interface AgentMissionStore {
  reserve(input: Omit<MissionRecord, "missionId" | "state" | "createdAt" | "updatedAt" | "canonicalUrl" | "requestState">): Promise<MissionReservation>;
  saveReceipt(input: { ownerId: string; requestKey: string; receipt: MissionReceipt }): Promise<void>;
  updateRequestState(input: { ownerId: string; requestKey: string; state: "created" | "failed" | "unknown_outcome" }): Promise<void>;
  saveSnapshot(input: { ownerId: string; snapshot: MissionSnapshot }): Promise<void>;
  get(input: { ownerId: string; missionId: string }): Promise<MissionRecord | undefined>;
}

export interface ResourceAccessPolicy {
  canRead(input: { ownerId: string; resource: ResourceRef }): Promise<boolean>;
}

export interface RelatedResourceStore {
  listRelated(input: { ownerId: string; resource: ResourceRef }): Promise<NormalizedResource[]>;
  readAttachment?(input: { ownerId: string; resource: NormalizedResource }): Promise<ContextAttachment | undefined>;
  saveAgentRelation(input: { ownerId: string; from: ResourceRef; to: ResourceRef; relationType: "mission_for" | "report_for"; observedAt: string }): Promise<void>;
}

export interface PullRequestContextSource {
  getPullRequest(input: { ownerId: string; resource: ResourceRef }): Promise<{
    resource: ResourceRef;
    title: string;
    body?: string;
    state: string;
    author?: string;
    baseBranch?: string;
    headBranch?: string;
    headSha?: string;
    changedFiles: Array<{ path: string; status: string; additions?: number; deletions?: number; patch?: string }>;
    sourceUpdatedAt?: string;
    observedAt: string;
    canonicalUrl?: string;
  }>;
}

export class AgentLayerError extends Error {
  readonly code: AgentLayerErrorCode;

  constructor(code: AgentLayerErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = "AgentLayerError";
  }
}
