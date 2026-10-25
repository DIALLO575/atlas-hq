// Journal source: where the latest WORLD RADAR edition is read from. GET only.
import { parseJournalJson, parseJournalMarkdown } from "./journal.mjs";
import { serverSecretRecord } from "./server-secret.mjs";

export const JOURNAL_FIXTURE = Object.freeze({
  edition_id: "demo-2026-10-25-matin", generated_at: "2026-10-25T13:30:00Z",
  items: [
    { id: "ia-1", topic: "ia", title: "Exemple — un nouveau modèle open source publié", summary: "Données de démonstration : aucune information réelle.", why_it_matters: "Montre le rendu d’une carte IA.", certainty: "moyenne", status: "rapporte", source_url: "https://example.com/ia", source_name: "Example", extra_sources: [], image_url: null, published_at: "2026-10-25T08:00:00Z", author_bot: "Turing" },
    { id: "com-1", topic: "commerce", title: "Exemple — délais de fret maritime", summary: "Données de démonstration.", why_it_matters: null, certainty: "faible", status: "a_verifier", source_url: "https://example.com/fret", source_name: "Example", extra_sources: [], image_url: null, published_at: null, author_bot: "Mercator" },
    { id: "gn-1", topic: "guinee", title: "Exemple — actualité Conakry", summary: "Données de démonstration.", why_it_matters: null, certainty: "elevee", status: "confirme", source_url: "https://example.com/gn", source_name: "Example", extra_sources: [], image_url: null, published_at: null, author_bot: "Kora" },
  ],
});
export class JournalSourceError extends Error {
  constructor(code, status = 503) { super(code); this.name = "JournalSourceError"; this.code = code; this.status = status; }
}
/**
 * Resolves the source from server env only. ATLAS_MAUSBOT_JOURNAL_URL must be an https URL
 * served by a dedicated read-only Caddy GET route (see docs/operations/morning-journal.md);
 * it reuses the existing MausBot bearer (never returned). ATLAS_MAUSBOT_JOURNAL_DEMO=true
 * serves fixture data outside production only.
 */
export function resolveJournalSource(env, config) {
  const raw = env.ATLAS_MAUSBOT_JOURNAL_URL?.trim();
  if (raw && config?.token) {
    let u; try { u = new URL(raw); } catch { throw new JournalSourceError("JOURNAL_SOURCE_INVALID"); }
    if (u.protocol !== "https:" || u.username || u.password || u.hash) throw new JournalSourceError("JOURNAL_SOURCE_INVALID");
    return serverSecretRecord({ kind: "http", url: u.toString() }, config.token);
  }
  if (env.ATLAS_MAUSBOT_JOURNAL_DEMO === "true" && env.VERCEL_ENV !== "production" && env.NODE_ENV !== "production")
    return { kind: "fixture" };
  return null;
}
export async function readJournalEdition(source, { fetchImpl = fetch, timeoutMs = 6000 } = {}) {
  if (source.kind === "fixture") return { ...parseJournalJson(JOURNAL_FIXTURE), demo: true };
  let response;
  try {
    response = await fetchImpl(source.url, { method: "GET", redirect: "error", cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs), headers: { Accept: "application/json, text/markdown", Authorization: "Bearer " + source.token } });
  } catch { throw new JournalSourceError("JOURNAL_SOURCE_UNAVAILABLE"); }
  if (response.status === 404) throw new JournalSourceError("JOURNAL_EDITION_NOT_FOUND", 404);
  if (!response.ok) throw new JournalSourceError("JOURNAL_SOURCE_UNAVAILABLE");
  const len = Number(response.headers.get("content-length") ?? 0);
  if (len > 2_000_000) throw new JournalSourceError("JOURNAL_SOURCE_TOO_LARGE", 502);
  const text = await response.text();
  if (text.length > 2_000_000) throw new JournalSourceError("JOURNAL_SOURCE_TOO_LARGE", 502);
  try {
    const type = response.headers.get("content-type") ?? "";
    const edition = /json/.test(type) || text.trimStart().startsWith("{") ? parseJournalJson(text) : parseJournalMarkdown(text);
    return { ...edition, demo: false };
  } catch { throw new JournalSourceError("JOURNAL_EDITION_INVALID", 502); }
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
