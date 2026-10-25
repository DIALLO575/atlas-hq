// Pure quality checks for a v1 journal edition (raw contract shape). Reusable by n8n, a future journal-mcp and tests.
import { validateJournalEdition } from "./journal.mjs";

export const QUALITY_CHECKS = Object.freeze(["contract_invalid", "missing_source", "duplicate_in_edition", "duplicate_across_editions", "missing_cover", "edition_late"]);

const normUrl = u => { try { const x = new URL(u); return (x.hostname.replace(/^www\./, "") + x.pathname.replace(/\/+$/, "")).toLowerCase(); } catch { return null; } };
const normTitle = t => typeof t === "string" ? t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim() : "";

/**
 * @param edition raw v1 payload
 * @param opts.previousItems items from earlier editions [{edition_id, id, source_url, title}]
 * @param opts.expectedBy ISO deadline for arrival; opts.receivedAt ISO (default now)
 * @returns {{ok:boolean, complete:boolean, counts:{items:number, withoutCover:number}, checks:{check:string, severity:"error"|"warning"|"info", item_id:string|null, detail:string}[]}}
 */
export function checkEdition(edition, { previousItems = [], expectedBy = null, receivedAt = null } = {}) {
  const checks = [];
  const add = (check, severity, item_id, detail) => checks.push({ check, severity, item_id, detail });
  const v = validateJournalEdition(edition);
  for (const e of v.errors.slice(0, 50)) add("contract_invalid", "error", null, e);
  const items = Array.isArray(edition?.items) ? edition.items.filter(i => i && typeof i === "object") : [];
  const seenUrl = new Map(), seenTitle = new Map();
  const prevUrl = new Map(), prevTitle = new Map();
  for (const p of previousItems) {
    if (p?.edition_id === edition?.edition_id) continue;
    const u = normUrl(p?.source_url); if (u) prevUrl.set(u, p.edition_id);
    const t = normTitle(p?.title); if (t) prevTitle.set(t, p.edition_id);
  }
  let withoutCover = 0;
  for (const i of items) {
    const id = typeof i.id === "string" ? i.id : null;
    if (!i.source_url || !normUrl(i.source_url) || !i.source_name) add("missing_source", "error", id, "Source principale absente ou invalide.");
    if (!i.cover) { withoutCover++; add("missing_cover", "warning", id, "Article sans image."); }
    const u = normUrl(i.source_url), t = normTitle(i.title);
    if ((u && seenUrl.has(u)) || (t && seenTitle.has(t))) add("duplicate_in_edition", "warning", id, "Doublon de " + (seenUrl.get(u) ?? seenTitle.get(t)) + " dans l’édition.");
    else if ((u && prevUrl.has(u)) || (t && prevTitle.has(t))) add("duplicate_across_editions", "info", id, "Déjà publié dans l’édition " + (prevUrl.get(u) ?? prevTitle.get(t)) + ".");
    if (u && !seenUrl.has(u)) seenUrl.set(u, id); if (t && !seenTitle.has(t)) seenTitle.set(t, id);
  }
  if (expectedBy) {
    const at = Date.parse(receivedAt ?? new Date().toISOString()), due = Date.parse(expectedBy);
    if (Number.isFinite(at) && Number.isFinite(due) && at > due) add("edition_late", "warning", null, "Édition arrivée " + Math.round((at - due) / 60000) + " min après l’heure attendue.");
  }
  return { ok: !checks.some(c => c.severity === "error"), complete: items.length > 0 && withoutCover === 0 && !checks.some(c => c.check === "missing_source"), counts: { items: items.length, withoutCover }, checks };
}

/** Arrival watchdog (no edition at all): returns a check if the deadline passed without an edition for that day. */
export function checkEditionMissing({ lastGeneratedAt, expectedBy, now }) {
  const due = Date.parse(expectedBy), n = Date.parse(now), last = lastGeneratedAt ? Date.parse(lastGeneratedAt) : NaN;
  if (!Number.isFinite(due) || !Number.isFinite(n) || n <= due) return null;
  if (Number.isFinite(last) && last > due - 20 * 3600 * 1000) return null;
  return { check: "edition_late", severity: "error", item_id: null, detail: "Aucune édition reçue à l’heure attendue." };
}
