export type JournalEditionLabelInput = { editionId?: string | null; generatedAt?: string | null; receivedAt?: string | null };
export type JournalEditionPeriod = "morning" | "midday" | "evening" | "general";
export function journalEditionPeriod(edition?: JournalEditionLabelInput): JournalEditionPeriod;
export function journalEditionPresentation(edition?: JournalEditionLabelInput): { title: string; short: string };
