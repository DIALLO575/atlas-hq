import type { AgentIdentity, AgentMissionState, MissionReceipt, MissionSnapshot, ResourceRef } from "@/lib/agents/contracts";

export type AgentBridgeBootstrap = {
  state: "ready" | "loading" | "unavailable" | "error";
  agents: AgentDirectoryOption[];
  reason?: string;
};

export type AgentDirectoryOption = {
  identity: AgentIdentity;
  origin: "server" | "team_roster";
  activation: "enabled" | "disabled" | "unknown";
};

/** A browser-safe view model built from an authorized ContextDossier and its provenance. */
export type AgentResourceContext = {
  resource: ResourceRef;
  title: string;
  source: string;
  freshness: "fresh" | "stale" | "unknown";
  observedAt: string;
  facts: Array<{ id: string; label: string; value: string }>;
  attachments: Array<{ kind: "text" | "document" | "image"; name: string }>;
};

/** ownerId and actorId are intentionally derived by the authenticated server session. */
export type AgentCreateRequest = {
  agentId: string;
  prompt: string;
  source: ResourceRef;
  idempotencyKey: string;
};

export type AgentMissionView = {
  missionId: MissionReceipt["missionId"];
  state: AgentMissionState;
  updatedAt?: string;
  error?: MissionSnapshot["error"];
  result?: MissionSnapshot["result"];
};
