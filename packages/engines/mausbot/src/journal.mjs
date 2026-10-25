// WORLD RADAR "journal du matin" — pure read-side parsing. No network, no secrets.
export const JOURNAL_CATEGORIES = Object.freeze([
  { id: "ia", label: "IA & outils" },
  { id: "commerce", label: "Commerce & logistique" },
  { id: "guinee", label: "Guinée" },
  { id: "afrique", label: "Afrique" },
  { id: "monde", label: "Monde / géopolitique" },
  { id: "economie", label: "Économie / marchés" },
]);
const CERTAINTY = ["elevee", "moyenne", "faible"];
const STATUS = ["confirme", "rapporte", "a_verifier"];
const ID = /^[A-Za-z0-9._:-]{1,120}$/;

function fold(value) {
  return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}
/** Map a free topic (JSON enum or Markdown heading) to one of six categories, or null. */
export function normalizeJournalTopic(raw) {
  const t = fold(raw);
  if (!t) return null;
  if (/\b(ia|ai|intelligence artificielle|llm|outils?|tech|technolog)/.test(t)) return "ia";
  if (/guinee|conakry/.test(t)) return "guinee";
  if (/afrique|africa|cedeao|ecowas/.test(t)) return "afrique";
  if (/commerce|logisti|e-?commerce|retail|supply/.test(t)) return "commerce";
  if (/econom|marche|bourse|finance|inflation/.test(t)) return "economie";
  if (/monde|geopoliti|world|international|politique/.test(t)) return "monde";
  return null;
}
export function safeHttpUrl(value) {
  if (typeof value !== "string" || value.length > 2048) return null;
  try {
    const u = new URL(value.trim());
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    if (u.username || u.password) return null;
    return u.toString();
  } catch { return null; }
}
function str(value, max) {
  if (typeof value !== "string") return null;
  const s = value.replace(/\s+/g, " ").trim();
  return s ? s.slice(0, max) : null;
}
function hostName(url) { try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return null; } }

export const JOURNAL_SCHEMA_VERSION = "1";
export const JOURNAL_TOPICS = Object.freeze(["ia", "commerce", "guinee", "afrique", "monde", "geopolitique", "economie", "tech"]);
export const JOURNAL_PRODUCERS = Object.freeze(["morgans", "grok-bot"]);
export const COVER_PATH = /^[A-Za-z0-9._-]{1,120}\/[A-Za-z0-9._-]{1,150}\.(webp|png|jpg|jpeg)$/;
/** cover = { storage_path, generated, alt, credit, source_name } — storage_path is relative to the private bucket. */
export function normalizeCover(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const path = raw.storage_path;
  if (typeof path !== "string" || !COVER_PATH.test(path) || path.includes("..")) return null;
  return { storagePath: path, generated: raw.generated === true, alt: str(raw.alt, 300) ?? "",
    credit: str(raw.credit, 200), sourceName: str(raw.source_name, 120) };
}
const isoDate = v => typeof v === "string" && /^\d{4}-\d{2}-\d{2}T/.test(v) && !Number.isNaN(Date.parse(v));
const httpUrl = v => typeof v === "string" && v.length <= 2048 && /^https?:\/\//.test(v) && safeHttpUrl(v) !== null;
const sized = (v, min, max) => typeof v === "string" && v.length >= min && v.length <= max;
const nullOr = (v, f) => v === null || v === undefined || f(v);
function onlyKeys(obj, allowed, path, errors) {
  for (const k of Object.keys(obj)) if (!allowed.includes(k)) errors.push(path + "." + k + ": propriété inconnue");
}
/**
 * Strict validator mirroring packages/engines/mausbot/schema/journal-edition.v1.schema.json.
 * n8n may use the JSON Schema (or this function in a Code node); ATLAS uses it in tests and the demo path.
 */
export function validateJournalEdition(data) {
  const e = [];
  if (!data || typeof data !== "object" || Array.isArray(data)) return { ok: false, errors: ["$: objet attendu"] };
  onlyKeys(data, ["schema_version", "edition_id", "generated_at", "producer", "items"], "$", e);
  if (data.schema_version !== JOURNAL_SCHEMA_VERSION) e.push("$.schema_version: doit valoir \"1\"");
  if (typeof data.edition_id !== "string" || !ID.test(data.edition_id)) e.push("$.edition_id: invalide");
  if (!isoDate(data.generated_at)) e.push("$.generated_at: date-time attendue");
  if (!JOURNAL_PRODUCERS.includes(data.producer)) e.push("$.producer: invalide");
  if (!Array.isArray(data.items) || data.items.length < 1 || data.items.length > 200) e.push("$.items: 1 à 200 éléments");
  const seen = new Set();
  (Array.isArray(data.items) ? data.items : []).forEach((it, i) => {
    const p = "$.items[" + i + "]";
    if (!it || typeof it !== "object" || Array.isArray(it)) { e.push(p + ": objet attendu"); return; }
    onlyKeys(it, ["id", "topic", "title", "summary", "why_it_matters", "certainty", "status", "source_url", "source_name", "extra_sources", "published_at", "author_bot", "cover"], p, e);
    if (typeof it.id !== "string" || !ID.test(it.id)) e.push(p + ".id: invalide");
    else if (seen.has(it.id)) e.push(p + ".id: doublon"); else seen.add(it.id);
    if (!JOURNAL_TOPICS.includes(it.topic)) e.push(p + ".topic: invalide");
    if (!sized(it.title, 1, 240)) e.push(p + ".title: 1 à 240 caractères");
    if (!sized(it.summary, 1, 2000)) e.push(p + ".summary: 1 à 2000 caractères");
    if (!nullOr(it.why_it_matters, v => sized(v, 0, 1000))) e.push(p + ".why_it_matters: invalide");
    if (!CERTAINTY.includes(it.certainty)) e.push(p + ".certainty: invalide");
    if (!STATUS.includes(it.status)) e.push(p + ".status: invalide");
    if (!httpUrl(it.source_url)) e.push(p + ".source_url: URL http(s) attendue");
    if (!sized(it.source_name, 1, 120)) e.push(p + ".source_name: invalide");
    if (it.extra_sources !== undefined && (!Array.isArray(it.extra_sources) || it.extra_sources.length > 8 ||
        it.extra_sources.some(x => !x || typeof x !== "object" || Object.keys(x).some(k => k !== "url" && k !== "name") || !httpUrl(x.url) || !sized(x.name, 0, 120))))
      e.push(p + ".extra_sources: invalide");
    if (!nullOr(it.published_at, isoDate)) e.push(p + ".published_at: invalide");
    if (!nullOr(it.author_bot, v => sized(v, 0, 60))) e.push(p + ".author_bot: invalide");
    if (!("cover" in it)) e.push(p + ".cover: requis (objet ou null)");
    else if (it.cover !== null) {
      const c = it.cover;
      if (!c || typeof c !== "object" || Array.isArray(c)) e.push(p + ".cover: invalide");
      else {
        onlyKeys(c, ["storage_path", "generated", "alt", "credit", "source_name"], p + ".cover", e);
        for (const k of ["storage_path", "generated", "alt", "credit", "source_name"]) if (!(k in c)) e.push(p + ".cover." + k + ": requis");
        if (typeof c.storage_path !== "string" || !COVER_PATH.test(c.storage_path) || c.storage_path.includes("..")) e.push(p + ".cover.storage_path: invalide");
        if (typeof c.generated !== "boolean") e.push(p + ".cover.generated: booléen attendu");
        if (!sized(c.alt, 0, 300)) e.push(p + ".cover.alt: invalide");
        if (!nullOr(c.credit, v => sized(v, 0, 200))) e.push(p + ".cover.credit: invalide");
        if (!nullOr(c.source_name, v => sized(v, 0, 120))) e.push(p + ".cover.source_name: invalide");
      }
    }
  });
  return { ok: e.length === 0, errors: e.slice(0, 50) };
}
function normalizeItem(raw, editionId) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const category = normalizeJournalTopic(raw.topic);
  const id = typeof raw.id === "string" && ID.test(raw.id) ? raw.id : null;
  const title = str(raw.title, 240);
  if (!category || !id || !title) return null;
  const sourceUrl = safeHttpUrl(raw.source_url);
  const extra = Array.isArray(raw.extra_sources) ? raw.extra_sources.slice(0, 8).map(s => {
    const url = safeHttpUrl(s?.url);
    return url ? { url, name: str(s?.name, 120) ?? hostName(url) } : null;
  }).filter(Boolean) : [];
  const published = typeof raw.published_at === "string" && !Number.isNaN(Date.parse(raw.published_at)) ? raw.published_at : null;
  return {
    id, editionId, category, topic: str(raw.topic, 40), title,
    summary: str(raw.summary, 2000) ?? "", whyItMatters: str(raw.why_it_matters, 1000),
    certainty: CERTAINTY.includes(raw.certainty) ? raw.certainty : null,
    status: STATUS.includes(raw.status) ? raw.status : null,
    sourceUrl, sourceName: str(raw.source_name, 120) ?? (sourceUrl ? hostName(sourceUrl) : null),
    extraSources: extra, cover: normalizeCover(raw.cover), publishedAt: published,
    authorBot: str(raw.author_bot, 60),
  };
}
/** Strict JSON edition parser: invalid envelope throws, unknown topics / bad items are skipped. */
export function parseJournalJson(input) {
  const data = typeof input === "string" ? JSON.parse(input) : input;
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("JOURNAL_JSON_INVALID");
  const editionId = typeof data.edition_id === "string" && ID.test(data.edition_id) ? data.edition_id : null;
  if (!editionId || !Array.isArray(data.items)) throw new Error("JOURNAL_JSON_INVALID");
  const seen = new Set();
  const items = [];
  for (const raw of data.items.slice(0, 200)) {
    const item = normalizeItem(raw, editionId);
    if (item && !seen.has(item.id)) { seen.add(item.id); items.push(item); }
  }
  const generatedAt = typeof data.generated_at === "string" && !Number.isNaN(Date.parse(data.generated_at)) ? data.generated_at : null;
  return { editionId, generatedAt, format: "json", items, skipped: data.items.length - items.length };
}
/** Maps Supabase journal_items rows (snake_case, cover jsonb) to display items. Invalid rows skipped. */
export function journalItemsFromRows(editionId, rows) {
  const items = [];
  for (const r of Array.isArray(rows) ? rows : []) {
    const item = normalizeItem({ ...r, id: r?.item_id }, editionId);
    if (item) items.push(item);
  }
  return items;
}

function slug(s) { return fold(s).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "item"; }
function section(body, name) {
  const re = new RegExp("^\\s*(?:[-*]\\s*)?(?:\\*\\*)?" + name + "(?:\\*\\*)?\\s*:?\\s*(?:\\*\\*)?\\s*:?(.*)$", "im");
  const m = body.match(re);
  return m ? m[1].replace(/\*\*/g, "").trim() : null;
}
/** Fallback: parse world_radar_final_YYYY-MM-DD.md (## Thème — Titre blocks). */
export function parseJournalMarkdown(markdown, editionId) {
  if (typeof markdown !== "string") throw new Error("JOURNAL_MD_INVALID");
  const eid = typeof editionId === "string" && ID.test(editionId) ? editionId :
    "md-" + (markdown.match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? "unknown");
  const blocks = markdown.split(/^##\s+(?!#)/m).slice(1);
  const items = [];
  const seen = new Set();
  for (const block of blocks.slice(0, 200)) {
    const [heading, ...rest] = block.split("\n");
    const m = heading.match(/^(.+?)\s+[—–-]\s+(.+)$/);
    if (!m) continue;
    const category = normalizeJournalTopic(m[1]);
    if (!category) continue;
    const body = rest.join("\n");
    const links = [...body.matchAll(/\[([^\]]{1,120})\]\((https?:\/\/[^)\s]+)\)|(https?:\/\/[^\s)<>\]]+)/g)]
      .map(x => ({ name: x[1] ?? null, url: safeHttpUrl(x[2] ?? x[3]) })).filter(x => x.url);
    const srcIdx = body.search(/^\s*(?:[-*]\s*)?(?:\*\*)?Sources?/im);
    const srcLinks = srcIdx >= 0 ? links.filter(l => body.indexOf(l.url, srcIdx) >= 0) : links;
    const pick = srcLinks.length ? srcLinks : links;
    const certaintyText = fold(section(body, "Statut(?:\\s*/\\s*certitude)?") ?? "");
    let id = slug(m[2]);
    while (seen.has(id)) id += "-x";
    seen.add(id);
    items.push({
      id, editionId: eid, category, topic: m[1].trim().slice(0, 40), title: m[2].trim().slice(0, 240),
      summary: (section(body, "Faits") ?? body.replace(/\s+/g, " ").trim()).slice(0, 2000),
      whyItMatters: section(body, "Int[ée]r[êe]t"),
      certainty: /elev|haute|forte/.test(certaintyText) ? "elevee" : /moyen/.test(certaintyText) ? "moyenne" : /faible|bas/.test(certaintyText) ? "faible" : null,
      status: /confirm/.test(certaintyText) ? "confirme" : /verifier/.test(certaintyText) ? "a_verifier" : /rapport/.test(certaintyText) ? "rapporte" : null,
      sourceUrl: pick[0]?.url ?? null, sourceName: pick[0] ? (pick[0].name ?? hostName(pick[0].url)) : null,
      extraSources: pick.slice(1, 8).map(l => ({ url: l.url, name: l.name ?? hostName(l.url) })),
      cover: null, publishedAt: null, authorBot: null,
    });
  }
  return { editionId: eid, generatedAt: null, format: "markdown", items, skipped: 0 };
}
export function groupJournal(edition) {
  return JOURNAL_CATEGORIES.map(c => ({ ...c, count: edition.items.filter(i => i.category === c.id).length }));
}
