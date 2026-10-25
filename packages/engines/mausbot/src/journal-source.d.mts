import type { JournalEdition } from "./journal.mjs";
export type JournalSource = { kind: "http"; url: string; token: string } | { kind: "fixture" };
export const JOURNAL_FIXTURE: unknown;
export class JournalSourceError extends Error { code: string; status: number }
export function resolveJournalSource(env: Record<string, string | undefined>, config: { token?: string } | null): JournalSource | null;
export function readJournalEdition(source: JournalSource, deps?: { fetchImpl?: typeof fetch; timeoutMs?: number }): Promise<JournalEdition & { demo: boolean }>;
export function validateJournalStateInput(body: unknown): { workspaceId: string; editionId: string; itemId: string; status: "new" | "read" | "done" } | null;
