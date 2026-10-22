import { createHash } from "node:crypto";
import { AgentLayerError, type AgentIdentity, type AgentInvocation, type AgentMissionStore, type MissionReceipt, type MissionSnapshot, type OpenMausBotMissionGateway, type RelatedResourceStore, type ResourceAccessPolicy, type ResourceRef } from "./contracts.ts";
import { ContextResolver } from "./context-resolver.ts";

function hash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function asReceipt(record: NonNullable<Awaited<ReturnType<AgentMissionStore["get"]>>>): MissionReceipt {
  if (!record.missionId || !record.createdAt || !record.state) {
    throw new AgentLayerError("MISSION_REQUEST_IN_PROGRESS", "A request with this idempotency key is still being submitted or requires reconciliation");
  }
  return { missionId: record.missionId, state: record.state, createdAt: record.createdAt, canonicalUrl: record.canonicalUrl };
}

export class AgentBridge {
  private readonly agents: AgentIdentity[];
  private readonly contextResolver: ContextResolver;
  private readonly missions: OpenMausBotMissionGateway;
  private readonly store: AgentMissionStore;
  private readonly relations: RelatedResourceStore;
  private readonly access: ResourceAccessPolicy;
  private readonly now: () => Date;

  constructor(
    agents: AgentIdentity[],
    contextResolver: ContextResolver,
    missions: OpenMausBotMissionGateway,
    store: AgentMissionStore,
    relations: RelatedResourceStore,
    access: ResourceAccessPolicy,
    now: () => Date = () => new Date(),
  ) {
    this.agents = agents;
    this.contextResolver = contextResolver;
    this.missions = missions;
    this.store = store;
    this.relations = relations;
    this.access = access;
    this.now = now;
  }

  async invoke(input: AgentInvocation): Promise<MissionReceipt> {
    if (!input.ownerId || !input.actorId || !input.idempotencyKey || !input.prompt.trim()) {
      throw new AgentLayerError("INVALID_REQUEST", "Owner, actor, prompt and idempotency key are required");
    }
    const agent = this.agents.find((candidate) => candidate.id === input.agentId && candidate.enabled);
    if (!agent) throw new AgentLayerError("AGENT_NOT_AVAILABLE", `Agent ${input.agentId} is not available to this workspace`);
    if (!(await this.access.canRead({ ownerId: input.ownerId, resource: input.source }))) {
      throw new AgentLayerError("CONTEXT_FORBIDDEN", "The caller cannot read the source resource");
    }

    const context = await this.contextResolver.resolve({ ownerId: input.ownerId, source: input.source });
    const missionInput = {
      ownerId: input.ownerId,
      actorId: input.actorId,
      agentId: input.agentId,
      prompt: input.prompt.trim(),
      context,
      idempotencyKey: input.idempotencyKey,
    };
    // Hash the caller's stable intent. Dossier timestamps and provider freshness change on re-reads.
    const requestHash = hash({ ownerId: input.ownerId, actorId: input.actorId, agentId: input.agentId, prompt: input.prompt.trim(), source: input.source });
    const reservation = await this.store.reserve({
      ownerId: input.ownerId,
      actorId: input.actorId,
      source: context.source,
      requestKey: input.idempotencyKey,
      requestHash,
      agentId: input.agentId,
    });
    if (reservation.state === "conflict") throw new AgentLayerError("IDEMPOTENCY_CONFLICT", "This idempotency key was already used for a different request");
    if (reservation.state === "existing") {
      if (reservation.record.requestHash !== requestHash) throw new AgentLayerError("IDEMPOTENCY_CONFLICT", "This idempotency key was already used for a different request");
      const receipt = asReceipt(reservation.record);
      await this.saveMissionRelation(input.ownerId, reservation.record.source, receipt);
      return receipt;
    }

    let receipt: MissionReceipt;
    try {
      receipt = await this.missions.createMission(missionInput);
    } catch {
      await this.store.updateRequestState({ ownerId: input.ownerId, requestKey: input.idempotencyKey, state: "unknown_outcome" });
      throw new AgentLayerError("MISSION_API_UNAVAILABLE", "OpenMausBot did not confirm whether it created the mission; reconcile this request before retrying");
    }
    await this.store.saveReceipt({ ownerId: input.ownerId, requestKey: input.idempotencyKey, receipt });
    await this.store.updateRequestState({ ownerId: input.ownerId, requestKey: input.idempotencyKey, state: "created" });
    await this.saveMissionRelation(input.ownerId, context.source, receipt);
    return receipt;
  }

  async refresh(input: { ownerId: string; missionId: string }): Promise<MissionSnapshot> {
    const record = await this.store.get(input);
    if (!record) throw new AgentLayerError("MISSION_NOT_FOUND", "Mission is not linked to this owner");
    if (!record.missionId || record.missionId !== input.missionId) throw new AgentLayerError("MISSION_NOT_FOUND", "Mission is not linked to this owner");
    let snapshot: MissionSnapshot;
    try {
      snapshot = await this.missions.getMission(input);
    } catch {
      throw new AgentLayerError("MISSION_API_UNAVAILABLE", "OpenMausBot mission status is unavailable");
    }
    await this.store.saveSnapshot({ ownerId: input.ownerId, snapshot });
    if (snapshot.result) {
      const report: ResourceRef = {
        provider: "openmausbot",
        objectType: "report",
        objectId: snapshot.result.reportId,
        canonicalUrl: snapshot.result.canonicalUrl,
      };
      await this.relations.saveAgentRelation({ ownerId: input.ownerId, from: record.source, to: report, relationType: "report_for", observedAt: snapshot.result.completedAt });
    }
    return snapshot;
  }

  private async saveMissionRelation(ownerId: string, source: ResourceRef, receipt: MissionReceipt): Promise<void> {
    await this.relations.saveAgentRelation({
      ownerId,
      from: source,
      to: { provider: "openmausbot", objectType: "mission", objectId: receipt.missionId, canonicalUrl: receipt.canonicalUrl },
      relationType: "mission_for",
      observedAt: this.now().toISOString(),
    });
  }
}

/** Keeps the app honest when no real OpenMausBot mission transport has been configured. */
export class UnavailableOpenMausBotGateway implements OpenMausBotMissionGateway {
  async createMission(): Promise<MissionReceipt> {
    throw new AgentLayerError("MISSION_API_UNAVAILABLE", "No OpenMausBot mission API is configured for this ATLAS HQ runtime");
  }

  async getMission(): Promise<MissionSnapshot> {
    throw new AgentLayerError("MISSION_API_UNAVAILABLE", "No OpenMausBot mission API is configured for this ATLAS HQ runtime");
  }
}
