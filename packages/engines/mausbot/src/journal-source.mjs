// Journal source: ATLAS only READS Supabase (filled by n8n) and displays. No MausBot calls here.
import { journalItemKey, journalItemsFromRows, parseJournalJson } from "./journal.mjs";
import { editionTimestamp, rankEditions } from "./journal-ranking.mjs";

export const JOURNAL_BUCKET = "journal-covers";
export const SIGNED_URL_TTL_SECONDS = 3600;

export const JOURNAL_FIXTURE = Object.freeze({
  schema_version: "1", edition_id: "demo-2026-10-25-matin", generated_at: "2026-10-25T13:30:00Z", producer: "morgans",
  items: [
    { id: "ia-1", topic: "ia", title: "Exemple — un nouveau modèle open source publié", summary: "Données de démonstration : aucune information réelle. Le modèle annoncé met l’accent sur trois points :\n- poids ouverts et licence permissive ;\n- performances proches des modèles fermés ;\n- coût d’inférence réduit.\n\n> « Une étape pour l’écosystème ouvert », selon [Example](https://example.com/ia).", why_it_matters: "Montre le rendu d’une carte IA.", certainty: "moyenne", status: "rapporte", source_url: "https://example.com/ia", source_name: "Example", extra_sources: [], featured: true, published_at: "2026-10-25T08:00:00Z", author_bot: "Turing", cover: null },
    { id: "com-1", topic: "commerce", title: "Exemple — délais de fret maritime", summary: "Données de démonstration.", why_it_matters: null, certainty: "faible", status: "a_verifier", source_url: "https://example.com/fret", source_name: "Example", extra_sources: [], published_at: null, author_bot: "Mercator", cover: null },
    { id: "gn-1", topic: "guinee", title: "Exemple — actualité Conakry", summary: "Données de démonstration.", why_it_matters: null, certainty: "elevee", status: "confirme", source_url: "https://example.com/gn", source_name: "Example", extra_sources: [], published_at: null, author_bot: "Kora", cover: null },
    { id: "af-1", topic: "afrique", title: "Exemple — corridor logistique ouest-africain", summary: "Données de démonstration.\n1. Annonce du financement ;\n2. Calendrier des travaux.", why_it_matters: "Illustre une liste numérotée.", certainty: "moyenne", status: "rapporte", source_url: "https://example.com/af", source_name: "Example Afrique", extra_sources: [{ url: "https://example.org/af2", name: "Second média" }], published_at: null, author_bot: "Kora", cover: null },
    { id: "mo-1", topic: "monde", title: "Exemple — sommet international sur le climat", summary: "Données de démonstration.", why_it_matters: null, certainty: "elevee", status: "confirme", source_url: "https://example.com/monde", source_name: "Example Monde", extra_sources: [], published_at: null, author_bot: "Atlas", cover: null },
    { id: "eco-1", topic: "economie", title: "Exemple — inflation et taux directeurs", summary: "Données de démonstration.", why_it_matters: "Effet direct sur les coûts d’importation.", certainty: "moyenne", status: "rapporte", source_url: "https://example.com/eco", source_name: "Example Éco", extra_sources: [], published_at: null, author_bot: "Mercator", cover: null },
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
  const metadata = { editionId: e.editionId, generatedAt: e.generatedAt, receivedAt: null, producer: "morgans" };
  return { ...e, editions: [metadata], coverExpiresAt: null, demo: true, producer: "morgans", items: e.items.map(i => ({ ...i, key: journalItemKey(i.editionId, i.id), coverUrl: null })) };
}
// "*" so the optional `featured` column (migration 20261025224000) is read when present without breaking before it.
const ITEM_COLUMNS = "*";

/**
 * Reads each producer's latest edition for a workspace with the caller's (owner) Supabase session —
 * RLS enforces owner-only. Cover images come from the private bucket through short-lived signed URLs.
 */
export async function readJournalFromSupabase(supabase, workspaceId, { ttl = SIGNED_URL_TTL_SECONDS } = {}) {
  const editions = await Promise.all(["morgans", "grok-bot"].map(async producer => {
    const { data, error } = await supabase.from("journal_editions")
      .select("edition_id,generated_at,received_at,producer,schema_version")
      .eq("workspace_id", workspaceId).eq("producer", producer)
      .order("generated_at", { ascending: false }).limit(1).maybeSingle();
    if (error) throw new JournalSourceError("JOURNAL_SOURCE_UNAVAILABLE");
    return data;
  }));
  const available = editions.filter(Boolean);
  if (!available.length) throw new JournalSourceError("JOURNAL_EDITION_NOT_FOUND", 404);
  if (available.some(edition => edition.schema_version !== "1")) throw new JournalSourceError("JOURNAL_SCHEMA_UNSUPPORTED", 502);
  const rowsByEdition = await Promise.all(available.map(async edition => {
    const { data, error } = await supabase.from("journal_items").select(ITEM_COLUMNS)
      .eq("workspace_id", workspaceId).eq("edition_id", edition.edition_id).order("position", { ascending: true }).limit(200);
    if (error) throw new JournalSourceError("JOURNAL_SOURCE_UNAVAILABLE");
    return { edition, items: journalItemsFromRows(edition.edition_id, data).slice(0, 40) };
  }));
  rowsByEdition.sort((a, b) => editionTimestamp(b.edition) - editionTimestamp(a.edition));
  const items = rowsByEdition.flatMap(({ items }) => items);
  const latest = rankEditions(available)[0];
  const producer = rowsByEdition.map(({ edition }) => edition.producer).join("+");
  const editionsMetadata = rowsByEdition.map(({ edition }) => ({ editionId: edition.edition_id, generatedAt: edition.generated_at ?? null, receivedAt: edition.received_at ?? null, producer: edition.producer }));
  const paths = [...new Set(items.map(i => i.cover?.storagePath).filter(Boolean))].map(p => workspaceId + "/" + p);
  const signed = new Map();
  if (paths.length) {
    const { data } = await supabase.storage.from(JOURNAL_BUCKET).createSignedUrls(paths, ttl);
    for (const s of data ?? []) if (s?.signedUrl && !s.error && s.path) signed.set(s.path, s.signedUrl);
  }
  return {
    coverExpiresAt: new Date(Date.now() + ttl * 1000).toISOString(), editionId: latest.edition_id, generatedAt: latest.generated_at ?? latest.received_at ?? null, receivedAt: latest.received_at ?? null, editions: editionsMetadata, producer, format: "json", demo: false, skipped: 0,
    items: items.map(i => ({ ...i, key: journalItemKey(i.editionId, i.id), coverUrl: i.cover ? signed.get(workspaceId + "/" + i.cover.storagePath) ?? null : null })),
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

// Progress wire contract: no caller identity, dates, article text or URLs.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function exactProgressObject(value, keys) {
  return value && typeof value === 'object' && !Array.isArray(value)
    && [Object.prototype, null].includes(Object.getPrototypeOf(value))
    && Reflect.ownKeys(value).length === keys.length && keys.every(k => Object.hasOwn(value, k));
}
export function validateJournalProgressInput(body) {
  if (!exactProgressObject(body, ['workspaceId', 'batchId', 'events']) || typeof body.workspaceId !== 'string' || !UUID.test(body.workspaceId)
    || typeof body.batchId !== 'string' || !UUID.test(body.batchId) || !Array.isArray(body.events) || body.events.length < 1 || body.events.length > 20) return null;
  const seen = new Set(); const events = []; let total = 0;
  for (const event of body.events) {
    if (!exactProgressObject(event, ['editionId', 'itemId', 'deltaSeconds', 'position'])
      || typeof event.editionId !== 'string' || !ID.test(event.editionId) || typeof event.itemId !== 'string' || !ID.test(event.itemId)
      || !Number.isInteger(event.deltaSeconds) || event.deltaSeconds < 0 || event.deltaSeconds > 120
      || typeof event.position !== 'number' || !Number.isFinite(event.position) || event.position < 0 || event.position > 1
      || Math.abs(event.position * 100 - Math.round(event.position * 100)) > 1e-8) return null;
    const key = journalItemKey(event.editionId, event.itemId);
    if (seen.has(key)) return null;
    seen.add(key); total += event.deltaSeconds;
    events.push({ editionId: event.editionId, itemId: event.itemId, deltaSeconds: event.deltaSeconds, position: event.position });
  }
  if (total > 120) return null;
  events.sort((a, b) => journalItemKey(a.editionId, a.itemId).localeCompare(journalItemKey(b.editionId, b.itemId)));
  return { workspaceId: body.workspaceId.toLowerCase(), batchId: body.batchId.toLowerCase(), events };
}
