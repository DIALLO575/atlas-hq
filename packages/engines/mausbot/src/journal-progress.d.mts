import type { JournalProgressInput } from "./journal-source.mjs";

export const JOURNAL_READ_THRESHOLD_SECONDS: 30;
export function journalReadThresholdReached(secondsRead: number, deltaSeconds?: number): boolean;

export type JournalSummary = {
  total: number;
  read: number;
  unread: number;
  percentRead: number;
  today: string;
  progressAvailable?: boolean;
  todaySeconds: number | null;
  sevenDaySeconds: number | null;
  todayMinutes: number | null;
  sevenDayMinutes: number | null;
  byCategory: Record<string, { total: number; read: number }>;
  byProducer: Record<string, { total: number; read: number }>;
  warning?: string;
};
export function journalProgressMigrationMissing(error: unknown): boolean;
export function recordJournalProgress(supabase: unknown, body: unknown): Promise<
  | { ok: true; result: unknown }
  | { ok: false; code: "JOURNAL_PROGRESS_INVALID"; status: 400 }
  | { ok: false; code: string; status: 409 | 503 }
>;
export function readJournalSummary(supabase: unknown, workspaceId: string, userId: string, today?: string): Promise<JournalSummary>;
