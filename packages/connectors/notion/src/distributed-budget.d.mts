import type { NotionScopedReadBudget } from "./reliability.mjs";
export interface NotionBudgetBinding {
  workspaceId: string; userId: string; notionWorkspaceId: string;
  connectionId: string; version: number;
}
export interface NotionDistributedBudgetStore {
  reserve(binding: NotionBudgetBinding & { maxWaitMs: number }): Promise<{
    delayMs: number; probeLeaseId: string | null;
  } | null>;
  cooldown(binding: NotionBudgetBinding & { seconds: number | null }): Promise<boolean>;
  reportOutcome(binding: NotionBudgetBinding & {
    outcome: "success" | "transient"; probeLeaseId: string | null;
  }): Promise<boolean>;
}
export function createNotionDistributedBudget(args: {
  binding: NotionBudgetBinding;
  store: NotionDistributedBudgetStore;
  localBudget: NotionScopedReadBudget;
  maxWaitMs?: number;
  wait?: (ms: number, signal?: AbortSignal) => Promise<void>;
}): NotionScopedReadBudget & {
  observeOutcome(outcome: "success" | "transient",
    reservation?: { probeLeaseId: string | null } | null): Promise<void>;
};
