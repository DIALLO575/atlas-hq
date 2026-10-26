export type JournalEditionDate = { editionId?: string; edition_id?: string; generatedAt?: string | null; generated_at?: string | null; receivedAt?: string | null; received_at?: string | null };
export function editionTimestamp(edition: JournalEditionDate | null | undefined): number;
export function rankEditions<T extends JournalEditionDate>(editions: T[]): T[];
export function rankItems<T extends { editionId?: string; state?: "new" | "read" | "done"; lastPosition?: number | null; position?: number }>(items: T[], editions?: JournalEditionDate[]): T[];
