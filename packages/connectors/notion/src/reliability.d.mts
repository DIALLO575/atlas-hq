export class NotionBudgetError extends Error {
  code: string; retryAfterSeconds: number | null;
}
export interface NotionScopedReadBudget {
  beforeRequest(signal?: AbortSignal): Promise<void>;
  observeRateLimit(seconds: number | null): void | Promise<void>;
  observeOutcome?(outcome: "success" | "transient"): void | Promise<void>;
}
export interface NotionRestBudget {
  beforeRequest(scope: { workspaceId: string; connectionId: string },
    signal?: AbortSignal): Promise<void>;
  observeRateLimit(scope: { workspaceId: string; connectionId: string },
    seconds: number | null): void;
}
export function waitForNotionBudget(ms: number, signal?: AbortSignal): Promise<void>;
export function createNotionRestBudget(args?: {
  intervalMs?: number; maxWaitMs?: number; maxPending?: number;
  maxKeys?: number; now?: () => number;
  wait?: (ms: number, signal?: AbortSignal) => Promise<void>;
}): NotionRestBudget;
export function notionRestBudgetForPersonalConnection(args: {
  workspaceId: string; connectionId: string;
}): NotionScopedReadBudget;
