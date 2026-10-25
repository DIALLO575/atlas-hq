export type QualityCheck = { check: string; severity: "error" | "warning" | "info"; item_id: string | null; detail: string };
export const QUALITY_CHECKS: readonly string[];
export function checkEdition(edition: unknown, opts?: { previousItems?: { edition_id: string; id?: string; source_url?: string; title?: string }[]; expectedBy?: string | null; receivedAt?: string | null }): { ok: boolean; complete: boolean; counts: { items: number; withoutCover: number }; checks: QualityCheck[] };
export function checkEditionMissing(input: { lastGeneratedAt: string | null; expectedBy: string; now: string }): QualityCheck | null;
