export type JournalCategory = "ia" | "commerce" | "guinee" | "afrique" | "monde" | "economie";
export type JournalItem = {
  id: string; editionId: string; category: JournalCategory; topic: string | null; title: string;
  summary: string; whyItMatters: string | null; certainty: "elevee" | "moyenne" | "faible" | null;
  status: "confirme" | "rapporte" | "a_verifier" | null; sourceUrl: string | null; sourceName: string | null;
  extraSources: { url: string; name: string | null }[]; imageUrl: string | null; publishedAt: string | null; authorBot: string | null;
};
export type JournalEdition = { editionId: string; generatedAt: string | null; format: "json" | "markdown"; items: JournalItem[]; skipped: number };
export const JOURNAL_CATEGORIES: readonly { id: JournalCategory; label: string }[];
export function normalizeJournalTopic(raw: unknown): JournalCategory | null;
export function safeHttpUrl(value: unknown): string | null;
export function parseJournalJson(input: unknown): JournalEdition;
export function parseJournalMarkdown(markdown: unknown, editionId?: string): JournalEdition;
export function groupJournal(edition: JournalEdition): { id: JournalCategory; label: string; count: number }[];
