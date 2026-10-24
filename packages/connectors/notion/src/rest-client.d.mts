export const NOTION_API_VERSION: string;
export class NotionReadError extends Error {
  code: string; status: number | null; retryAfterSeconds: number | null;
}
export function createNotionReadClient(args: {
  token: string; request?: typeof fetch; timeoutMs?: number;
}): {
  getPage(id: string, options?: { signal?: AbortSignal }): Promise<Record<string, unknown>>;
  getBlock(id: string, options?: { signal?: AbortSignal }): Promise<Record<string, unknown>>;
  getDatabase(id: string, options?: { signal?: AbortSignal }): Promise<Record<string, unknown>>;
  getDataSource(id: string, options?: { signal?: AbortSignal }): Promise<Record<string, unknown>>;
  listBlockChildren(id: string, options?: {
    startCursor?: string | null; size?: number; signal?: AbortSignal;
  }): Promise<{ results: Array<Record<string, unknown>>;
    has_more: boolean; next_cursor: string | null }>;
  getCurrentBot(options?: { signal?: AbortSignal }): Promise<Record<string, unknown>>;
  searchByTitle(options?: {
    query?: string; startCursor?: string | null; size?: number; signal?: AbortSignal;
  }): Promise<{ results: Array<Record<string, unknown>>; has_more: boolean;
    next_cursor: string | null }>;
};
