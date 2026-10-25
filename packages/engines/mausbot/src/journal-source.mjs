// Journal source: ATLAS only READS Supabase (filled by n8n) and displays. No MausBot calls here.
import { journalItemsFromRows, parseJournalJson } from "./journal.mjs";

export const JOURNAL_BUCKET = "journal-covers";
export const SIGNED_URL_TTL_SECONDS = 3600;

export const JOURNAL_FIXTURE = Object.freeze({
  schema_version: "1", edition_id: "demo-2026-10-25-matin", generated_at: "2026-10-25T13:30:00Z", producer: "morgans",
  items: [
    { id: "ia-1", topic: "ia", title: "Exemple — un nouveau modèle open source publié", summary: "Données de démonstration : aucune information réelle.", why_it_matters: "Montre le rendu d’une carte IA.", certainty: "moyenne", status: "rapporte", source_url: "https://example.com/ia", source_name: "Example", extra_sources: [], published_at: "2026-10-25T08:00:00Z", author_bot: "Turing", cover: null },
    { id: "com-1", topic: "commerce", title: "Exemple — délais de fret maritime", summary: "Données de démonstration.", why_it_matters: null, certainty: "faible", status: "a_verifier", source_url: "https://example.com/fret", source_name: "Example", extra_sources: [], published_at: null, author_bot: "Mercator", cover: null },
    { id: "gn-1", topic: "guinee", title: "Exemple — actualité Conakry", summary: "Données de démonstration.", why_it_matters: null, certainty: "elevee", status: "confirme", source_url: "https://example.com/gn", source_name: "Example", extra_sources: [], published_at: null, author_bot: "Kora", cover: null },
  ],
});
export class JournalSourceError extends Error {
  constructor(code, status = 503) { super(code); this.name = "JournalSourceError"; this.code = code; this.status = status; }
}
/** Demo fixture only outside production; otherwise Supabase. */
export function journalDemoAllowed(env) {
  return env.ATLAS_MAUSBOT_JOURNAL_DEMO === "true" && env.VERCEL_ENV !== "production" && env.NODE_ENV !== "production";
}
export function readJournalDemo() {
  const e = parseJournalJson(JOURNAL_FIXTURE);
  return { ...e, demo: true, producer: "morgans", items: e.items.map(i => ({ ...i, coverUrl: null })) };
}
const ITEM_COLUMNS = "item_id,topic,title,summary,why_it_matters,certainty,status,source_url,source_name,extra_sources,published_at,author_bot,cover,position";

/**
 * Reads the latest edition for a workspace with the caller's (owner) Supabase session — RLS enforces
 * owner-only. Cover images come from the private bucket through short-lived signed URLs created here.
 */
export async function readJournalFromSupabase(supabase, workspaceId, { ttl = SIGNED_URL_TTL_SECONDS } = {}) {
  const { data: edition, error } = await supabase.from("journal_editions")
    .select("edition_id,generated_at,producer,schema_version")
    .eq("workspace_id", workspaceId).order("generated_at", { ascending: false }).limit(1).maybeSingle();
  if (error) throw new JournalSourceError("JOURNAL_SOURCE_UNAVAILABLE");
  if (!edition) throw new JournalSourceError("JOURNAL_EDITION_NOT_FOUND", 404);
  if (edition.schema_version !== "1") throw new JournalSourceError("JOURNAL_SCHEMA_UNSUPPORTED", 502);
  const { data: rows, error: rowsError } = await supabase.from("journal_items").select(ITEM_COLUMNS)
    .eq("workspace_id", workspaceId).eq("edition_id", edition.edition_id).order("position", { ascending: true }).limit(200);
  if (rowsError) throw new JournalSourceError("JOURNAL_SOURCE_UNAVAILABLE");
  const items = journalItemsFromRows(edition.edition_id, rows).slice(0, 40);
  const paths = [...new Set(items.map(i => i.cover?.storagePath).filter(Boolean))].map(p => workspaceId + "/" + p);
  const signed = new Map();
  if (paths.length) {
    const { data } = await supabase.storage.from(JOURNAL_BUCKET).createSignedUrls(paths, ttl);
    for (const s of data ?? []) if (s?.signedUrl && !s.error && s.path) signed.set(s.path, s.signedUrl);
  }
  return {
    editionId: edition.edition_id, generatedAt: edition.generated_at, producer: edition.producer, format: "json", demo: false, skipped: 0,
    items: items.map(i => ({ ...i, coverUrl: i.cover ? signed.get(workspaceId + "/" + i.cover.storagePath) ?? null : null })),
  };
}
const STATES = ["new", "read", "done"];
const ID = /^[A-Za-z0-9._:-]{1,120}$/;
export function validateJournalStateInput(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const keys = Object.keys(body).sort().join(",");
  if (keys !== "editionId,itemId,status,workspaceId") return null;
  if (!ID.test(body.editionId ?? "") || !ID.test(body.itemId ?? "") || !STATES.includes(body.status)) return null;
  if (typeof body.workspaceId !== "string") return null;
  return { workspaceId: body.workspaceId, editionId: body.editionId, itemId: body.itemId, status: body.status };
}
