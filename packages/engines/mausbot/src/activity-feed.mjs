// Inbox activity feed (separate from needs-you). Strict allow-list: unknown types are dropped, never rendered.
export const ACTIVITY_TYPES = Object.freeze(["journal_ready"]);
const ID = /^[A-Za-z0-9._:-]{1,120}$/;
import { journalEditionPresentation } from "./journal-edition.mjs";

export function journalReadyEvent(workspaceId, edition) {
  if (!edition || !ID.test(edition.edition_id ?? "") || typeof workspaceId !== "string") return null;
  const count = Number.isInteger(edition.item_count) && edition.item_count > 0 ? edition.item_count : null;
  if (!count) return null;
  const heading = journalEditionPresentation({ editionId: edition.edition_id, generatedAt: edition.generated_at }).title;
  return { type: "journal_ready", id: "journal:" + edition.edition_id, at: edition.generated_at ?? null, count,
    title: heading + " prêt — " + count + " article" + (count > 1 ? "s" : ""), href: "/journal?workspaceId=" + encodeURIComponent(workspaceId) };
}
export function normalizeActivity(events) {
  const out = [];
  const seen = new Set();
  for (const e of Array.isArray(events) ? events : []) {
    if (!e || !ACTIVITY_TYPES.includes(e.type) || typeof e.id !== "string" || seen.has(e.id)) continue;
    if (typeof e.href !== "string" || !e.href.startsWith("/") || e.href.startsWith("//")) continue;
    seen.add(e.id);
    out.push({ type: e.type, id: e.id, at: typeof e.at === "string" ? e.at : null, title: String(e.title ?? "").slice(0, 160), href: e.href, count: e.count ?? null });
  }
  return out;
}
