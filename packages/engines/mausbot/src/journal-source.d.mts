import type { JournalItem } from "./journal.mjs";
export type DisplayJournal = { editionId: string; generatedAt: string | null; producer: string; format: "json"; demo: boolean; skipped: number; items: (JournalItem & { coverUrl: string | null })[] };
export const JOURNAL_BUCKET: "journal-covers";
export const SIGNED_URL_TTL_SECONDS: number;
export const JOURNAL_FIXTURE: unknown;
export class JournalSourceError extends Error { code: string; status: number }
export function journalDemoAllowed(env: Record<string, string | undefined>): boolean;
export function readJournalDemo(): DisplayJournal;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function readJournalFromSupabase(supabase: any, workspaceId: string, opts?: { ttl?: number }): Promise<DisplayJournal>;
export function validateJournalStateInput(body: unknown): { workspaceId: string; editionId: string; itemId: string; status: "new" | "read" | "done" } | null;
