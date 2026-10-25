export class EngineContextError extends Error { readonly code: string; constructor(code: string); }
export type EngineContextResource = Readonly<{
  provider: "github" | "notion"; connectionId: string; resourceId: string; sourceVersion: string;
  operation: "pull_requests.read" | "pull_requests.files.read" | "pages.read";
}>;
export type EngineContextScope = Readonly<{
  workspaceId: string; instanceId: string; runId: string; atlasAgentKey: string;
  resources: readonly EngineContextResource[];
}>;
export type EngineContextIdentity = Readonly<{ actorId: string; sessionId: string }>;
export type EngineContextSnapshot = Readonly<{
  workspaceId: string; instanceId: string; runId: string; missionId: string; actorId: string; sessionId: string;
  atlasAgentKey: string; remoteAgentKey: string; primitiveId: string; payloadSha256: string;
  missionAgentBindingId: string; missionAgentBindingVersion: number; missionAgentPrimitiveGrantId: string;
  runState: string; role: string; instanceVersion: number; connectionState: string;
  resources: readonly EngineContextResource[];
}>;
export interface EngineContextRepository {
  readSnapshot(input: {scope: EngineContextScope; auth: EngineContextIdentity}): Promise<Record<string, unknown> | null>;
}
export function createEngineContextRepository(input: {
  query(text: string, values: readonly string[]): Promise<{rows: Record<string, unknown>[]}>
}): Readonly<EngineContextRepository>;
export function createEngineContextResolver(input: {
  authenticate(session: unknown): Promise<EngineContextIdentity & {verified: true; expiresAt: number}>;
  repository: EngineContextRepository;
  authorize(input: {context: EngineContextSnapshot; contextDigest: string}): Promise<{
    allowed: boolean; contextDigest: string; checkedAt: number; expiresAt: number;
  }>;
  now?: () => number;
}): Readonly<{
  inspect(input: {session: unknown; scope: EngineContextScope}): Promise<Readonly<{
    kind: "engine-context-preflight"; workspaceId: string; instanceId: string; runId: string; missionId: string;
    atlasAgentKey: string; primitiveId: string; resources: readonly EngineContextResource[];
    contextDigest: string; checkedAt: number; canDispatch: false; canEnqueue: false;
    requiresRevalidationBeforeExecution: true;
  }>>;
}>;
