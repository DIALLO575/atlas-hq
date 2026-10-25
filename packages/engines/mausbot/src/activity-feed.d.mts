export type ActivityEvent = { type: "journal_ready"; id: string; at: string | null; title: string; href: string; count: number | null };
export const ACTIVITY_TYPES: readonly string[];
export function journalReadyEvent(workspaceId: string, edition: { edition_id?: string; item_count?: number; generated_at?: string | null } | null): ActivityEvent | null;
export function normalizeActivity(events: unknown): ActivityEvent[];
