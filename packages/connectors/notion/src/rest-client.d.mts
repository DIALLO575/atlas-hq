import type { NotionScopedReadBudget } from "./reliability.mjs";
export const NOTION_API_VERSION: string;
export class NotionReadError extends Error {
  code: string; status: number | null; retryAfterSeconds: number | null;
}
export function createNotionReadClient(args: {
  token: string; request?: typeof fetch; timeoutMs?: number;
  requestBudget?: NotionScopedReadBudget | null;
  retryOptions?: { maxRetries?: number; maxAutoWaitMs?: number;
    wait?: (ms: number, signal?: AbortSignal) => Promise<void>;
    random?: () => number };
}): {
  listBlockChildren(id: string, options?: {
    startCursor?: string | null; size?: number; signal?: AbortSignal;
  }): Promise<{ results: Array<Record<string, unknown>>;
    has_more: boolean; next_cursor: string | null }>;
  getCurrentBot(options?: { signal?: AbortSignal }): Promise<Record<string, unknown>>;
  getAsyncTask(id: string, options?: { signal?: AbortSignal }): Promise<Record<string, unknown>>;
  searchByTitle(options?: {
    query?: string; startCursor?: string | null; size?: number; signal?: AbortSignal;
  }): Promise<{ results: Array<Record<string, unknown>>; has_more: boolean;
    next_cursor: string | null }>;
};
