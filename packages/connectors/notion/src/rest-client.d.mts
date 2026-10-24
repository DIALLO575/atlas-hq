export const NOTION_API_VERSION: string;
export class NotionReadError extends Error {
  code: string; status: number | null; retryAfterSeconds: number | null;
}
export function createNotionReadClient(args: {
  token: string; request?: typeof fetch; timeoutMs?: number;
}): {
  getCurrentBot(options?: { signal?: AbortSignal }): Promise<Record<string, unknown>>;
  searchByTitle(options?: {
    query?: string; startCursor?: string | null; size?: number; signal?: AbortSignal;
  }): Promise<{ results: Array<Record<string, unknown>>; has_more: boolean;
    next_cursor: string | null }>;
};
