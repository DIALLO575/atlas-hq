export type EngineWorkerLease = Readonly<{
  workspaceId: string; instanceId: string; runId: string; outboxId: string;
  token: string; epoch: string;
}>;
export type EngineOutboxRepository = Readonly<{
  assertSimulation(): Promise<boolean>;
  claim(): Promise<EngineWorkerLease | null>;
  heartbeat(lease: EngineWorkerLease): Promise<boolean>;
  finish(lease: EngineWorkerLease, success: boolean): Promise<string>;
  reap(): Promise<number>;
}>;
export class EngineWorkerError extends Error { readonly code: string; }
export function createEngineOutboxRepository(options: {
  query: (text: string, values: unknown[]) => Promise<{ rows: Record<string, any>[] }>;
  workspaceId: string; worker: string; leaseSeconds?: number;
}): EngineOutboxRepository;
export function createEngineSimulationTransport(options: {
  recordReceipt: (operation: Readonly<{ workspaceId: string; instanceId: string;
    outboxId: string; idempotencyKey: string }>) => Promise<"recorded" | "duplicate">;
  retryable?: boolean;
}): Readonly<{ send(lease: EngineWorkerLease): Promise<string> }>;
export function runEngineSimulationOnce(options: {
  repository: EngineOutboxRepository; transport: ReturnType<typeof createEngineSimulationTransport>;
  signal?: AbortSignal; timeoutMs?: number;
}): Promise<Readonly<{ state: string; simulationOnly: true; canDispatch: false }>>;
