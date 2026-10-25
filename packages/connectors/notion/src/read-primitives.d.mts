export type NotionReadSort = {
  direction: "ascending" | "descending";
  property?: string;
  timestamp?: "created_time" | "last_edited_time";
};
export type NotionPropertyReadArgs = {
  pageId: string; propertyId: string; size?: number; startCursor?: string | null;
};
export type NotionDataSourceQueryArgs = {
  dataSourceId: string; size?: number; startCursor?: string | null;
  filter?: Record<string, unknown> | null; sorts?: NotionReadSort[];
  isArchived?: boolean | null;
};
export function notionPagePropertyRequest(args: NotionPropertyReadArgs):
  Readonly<{ method: "GET"; path: string }>;
export function notionDataSourceQueryRequest(args: NotionDataSourceQueryArgs):
  Readonly<{ method: "POST"; path: string; body: Readonly<Record<string, unknown>> }>;
