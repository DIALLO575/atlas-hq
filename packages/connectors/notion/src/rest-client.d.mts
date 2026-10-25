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
    Promise<{ object: string;id:string;view_id?:string;results: Array<Record<string, unknown>>;
      has_more: boolean; next_cursor?: string | null; total_count?: number }>;
  releaseViewQuery(viewId:string,queryId:string,options?:{signal?:AbortSignal}):Promise<true>;
  getPageProperty(pageId: string, propertyId: string, options?: {
    startCursor?: string | null; size?: number; signal?: AbortSignal;
  }): Promise<Record<string, unknown>>;
  queryDataSource(dataSourceId: string, options?: {
    startCursor?: string | null; size?: number; signal?: AbortSignal;
    filter?: Record<string, unknown> | null;
    sorts?: Array<{ property?: string; timestamp?: "created_time" | "last_edited_time";
      direction: "ascending" | "descending" }>;
    isArchived?: boolean | null;
  }): Promise<{ results: Array<Record<string, unknown>>;
    has_more: boolean; next_cursor: string | null }>;
  getPageMarkdown(id:string,options?:{signal?:AbortSignal}):Promise<{
    object:"page_markdown";id:string;markdown:string;truncated:boolean;
    unknown_block_ids:string[];
  }>;
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
