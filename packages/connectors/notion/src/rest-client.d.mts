import type { NotionScopedReadBudget } from "./reliability.mjs";
export const NOTION_API_VERSION: string;
export class NotionReadError extends Error {
  constructor(code: string, status?: number | null, retryAfterSeconds?: number | null);
  code: string; status: number | null; retryAfterSeconds: number | null;
}
export function createNotionReadClient(args: {
  token: string; request?: typeof fetch; timeoutMs?: number;
  requestBudget?: NotionScopedReadBudget | null;
  retryOptions?: { maxRetries?: number; maxAutoWaitMs?: number;
    wait?: (ms: number, signal?: AbortSignal) => Promise<void>;
    random?: () => number };
}): {
  listViews(options: { sourceKind: "database" | "data_source"; resourceId: string;
    startCursor?: string | null; size?: number; signal?: AbortSignal }): Promise<{
      results: Array<Record<string, unknown>>; has_more: boolean; next_cursor: string | null }>;
  getView(id: string, options?: { signal?: AbortSignal }): Promise<Record<string, unknown>>;
  previewView(id: string, options?: { size?: number; signal?: AbortSignal }):
    Promise<{ object: string; results: Array<Record<string, unknown>>;
      has_more: boolean; next_cursor?: string | null; total_count?: number }>;
  getPage(id: string, options?: { signal?: AbortSignal }): Promise<Record<string, unknown>>;
  getBlock(id: string, options?: { signal?: AbortSignal }): Promise<Record<string, unknown>>;
  getDatabase(id: string, options?: { signal?: AbortSignal }): Promise<Record<string, unknown>>;
  getDataSource(id: string, options?: { signal?: AbortSignal }): Promise<Record<string, unknown>>;
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
