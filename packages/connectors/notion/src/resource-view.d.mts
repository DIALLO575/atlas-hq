export function notionListView(raw: unknown): {
  results: { id: string; kind: string; title: string; editedAt: string | null; url: string | null }[];
  hasMore: boolean; nextCursor: string | null;
};
export function notionBlockView(raw: unknown): {
  results: { id: string; type: string; text: string; hasChildren: boolean }[];
  hasMore: boolean; nextCursor: string | null;
};
export function assertPersonalNotionConnection(args: {
  connection: Record<string, unknown> | null;
  registry: Record<string, unknown> | null;
  actor: { workspaceId: string; userId: string };
  connectionId: string;
}): true;

export function safeNotionUrl(value: unknown): string | null;
export function notionViewsList(raw: unknown): {
  results: { id: string; name: string; type: string; url: string | null;
    editedAt: string | null }[];
  hasMore: boolean; nextCursor: string | null;
};
export function notionViewPreview(raw: unknown): {
  results: { id: string; kind: string; title: string; editedAt: string | null; url: string | null }[];
  hasMore: boolean; totalCount: number | null;
};
