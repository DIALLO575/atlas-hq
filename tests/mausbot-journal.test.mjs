import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { normalizeCover, normalizeJournalTopic, parseJournalJson, parseJournalMarkdown, groupJournal, JOURNAL_CATEGORIES } from "../packages/engines/mausbot/src/journal.mjs";
import { resolveJournalSource, readJournalEdition, readJournalCover, validateJournalStateInput, JOURNAL_FIXTURE } from "../packages/engines/mausbot/src/journal-source.mjs";


test("topics normalize to six categories, unknown → null", () => {
  assert.equal(JOURNAL_CATEGORIES.length, 6);
  assert.equal(normalizeJournalTopic("ia"), "ia");
  assert.equal(normalizeJournalTopic("IA & outils"), "ia");
  assert.equal(normalizeJournalTopic("tech"), "ia");
  assert.equal(normalizeJournalTopic("Guinée"), "guinee");
  assert.equal(normalizeJournalTopic("afrique"), "afrique");
  assert.equal(normalizeJournalTopic("Commerce & logistique"), "commerce");
  assert.equal(normalizeJournalTopic("geopolitique"), "monde");
  assert.equal(normalizeJournalTopic("Économie / marchés"), "economie");
  assert.equal(normalizeJournalTopic("sport"), null);
});

test("JSON edition: strict envelope, bad items skipped, unsafe URLs dropped", () => {
  const e = parseJournalJson({ edition_id: "2026-10-25_matin", generated_at: "2026-10-25T13:00:00Z", items: [
    { id: "a", topic: "ia", title: "T", summary: "S", certainty: "elevee", status: "confirme", source_url: "https://x.com/a", cover: { file: "../etc/passwd.png", generated: true }, extra_sources: [{ url: "file:///etc/passwd" }, { url: "https://y.org/b", name: "Y" }] },
    { id: "b", topic: "sport", title: "ignored" },
    { id: "a", topic: "ia", title: "dup" },
    { id: "bad id!", topic: "ia", title: "x" },
    { id: "c", topic: "economie", title: "E", certainty: "wat", unknownField: 1, cover: { file: "radar-c.webp", generated: true, alt: "A", credit: "Reuters" } },
  ] });
  assert.equal(e.items.length, 2);
  assert.equal(e.skipped, 3);
  assert.equal(e.items[0].cover, null);
  assert.deepEqual(e.items[1].cover, { file: "radar-c.webp", generated: true, alt: "A", credit: "Reuters" });
  assert.equal(e.items[0].sourceName, "x.com");
  assert.deepEqual(e.items[0].extraSources, [{ url: "https://y.org/b", name: "Y" }]);
  assert.equal(e.items[1].certainty, null);
  assert.throws(() => parseJournalJson({ items: [] }));
  assert.throws(() => parseJournalJson("[]"));
  assert.equal(groupJournal(e).find(c => c.id === "ia").count, 1);
});

test("Markdown fallback splits on ## Thème — Titre and extracts sources", () => {
  const md = `# WORLD RADAR 2026-10-25\n\n## IA & outils — Nouveau modèle\n- **Faits** : Un labo publie un modèle.\n- **Statut/certitude** : confirmé, élevée\n- **Intérêt** : utile pour Velmo\n- **Source(s)** : [Le Monde](https://lemonde.fr/a) https://other.org/b\n\n## Sport — Ignoré\ntext\n\n## Guinée — Conakry\n- **Faits** : fait.\n- **Statut/certitude** : à vérifier, faible\n`;
  const e = parseJournalMarkdown(md);
  assert.equal(e.editionId, "md-2026-10-25");
  assert.equal(e.items.length, 2);
  const [a, g] = e.items;
  assert.equal(a.category, "ia");
  assert.equal(a.title, "Nouveau modèle");
  assert.equal(a.summary, "Un labo publie un modèle.");
  assert.equal(a.certainty, "elevee");
  assert.equal(a.status, "confirme");
  assert.equal(a.sourceUrl, "https://lemonde.fr/a");
  assert.equal(a.sourceName, "Le Monde");
  assert.equal(a.extraSources[0].url, "https://other.org/b");
  assert.equal(g.status, "a_verifier");
  assert.equal(g.certainty, "faible");
});

test("cover: MausBot attachment names only, generated flag strict", () => {
  assert.equal(normalizeCover({ file: "https://evil.example/x.png" }), null);
  assert.equal(normalizeCover({ file: "a/b.png" }), null);
  assert.equal(normalizeCover({ file: "x.svg" }), null);
  assert.equal(normalizeCover({ file: "x.jpeg", generated: "true" }).generated, false);
  assert.equal(normalizeCover(null), null);
});

test("cover proxy: GET to /api/attachments, image types only, size capped, token stays server-side", async () => {
  const config = { baseUrl: "https://mausbot.example", token: "SECRET-TOKEN" };
  let seen;
  const ok = async (url, init) => { seen = { url, init }; return new Response("img", { headers: { "content-type": "image/webp" } }); };
  const r = await readJournalCover(config, "radar-1.webp", { fetchImpl: ok });
  assert.equal(seen.url, "https://mausbot.example/api/attachments/radar-1.webp");
  assert.equal(seen.init.method, "GET");
  assert.equal(r.contentType, "image/webp");
  await assert.rejects(readJournalCover(config, "../x.png", { fetchImpl: ok }), /INVALID/);
  await assert.rejects(readJournalCover(config, "x.png", { fetchImpl: async () => new Response("<svg>", { headers: { "content-type": "image/svg+xml" } }) }), /NOT_IMAGE/);
  await assert.rejects(readJournalCover(config, "x.png", { fetchImpl: ok, maxBytes: 1 }), /TOO_LARGE/);
});

test("source: env-only, https only, token never serialized, demo blocked in production", async () => {
  assert.equal(resolveJournalSource({}, { token: "t" }), null);
  assert.throws(() => resolveJournalSource({ ATLAS_MAUSBOT_JOURNAL_URL: "http://x/" }, { token: "t" }));
  const s = resolveJournalSource({ ATLAS_MAUSBOT_JOURNAL_URL: "https://mausbot.example/journal/latest" }, { token: "SECRET-TOKEN" });
  assert.equal(JSON.stringify(s).includes("SECRET-TOKEN"), false);
  assert.equal(resolveJournalSource({ ATLAS_MAUSBOT_JOURNAL_DEMO: "true", VERCEL_ENV: "production" }, null), null);
  assert.deepEqual(resolveJournalSource({ ATLAS_MAUSBOT_JOURNAL_DEMO: "true" }, null), { kind: "fixture" });
  let seen;
  const fetchImpl = async (url, init) => { seen = init; return new Response(JSON.stringify(JOURNAL_FIXTURE), { headers: { "content-type": "application/json" } }); };
  const e = await readJournalEdition(s, { fetchImpl });
  assert.equal(seen.method, "GET");
  assert.equal(e.items.length, 3);
  assert.equal(JSON.stringify(e).includes("SECRET-TOKEN"), false);
  const md = async () => new Response("## IA — X\n- **Faits** : f\n", { headers: { "content-type": "text/markdown" } });
  assert.equal((await readJournalEdition(s, { fetchImpl: md })).format, "markdown");
  await assert.rejects(readJournalEdition(s, { fetchImpl: async () => new Response("", { status: 404 }) }), /NOT_FOUND/);
});

test("state input validation is strict", () => {
  const ok = { workspaceId: "w", editionId: "e1", itemId: "i1", status: "done" };
  assert.deepEqual(validateJournalStateInput(ok), ok);
  assert.equal(validateJournalStateInput({ ...ok, status: "deleted" }), null);
  assert.equal(validateJournalStateInput({ ...ok, extra: 1 }), null);
  assert.equal(validateJournalStateInput({ ...ok, itemId: "../x" }), null);
  assert.equal(validateJournalStateInput(null), null);
});

test("routes: owner-only, GET-only to MausBot, state writes Supabase not MausBot, needs-you untouched", () => {
  const read = readFileSync(new URL("../src/app/api/engines/mausbot/journal/route.ts", import.meta.url), "utf8");
  const state = readFileSync(new URL("../src/app/api/engines/mausbot/journal/state/route.ts", import.meta.url), "utf8");
  const owner = readFileSync(new URL("../src/lib/engines/journal-access.ts", import.meta.url), "utf8");
  assert.match(read, /requireJournalOwner/);
  assert.doesNotMatch(read, /export async function (POST|PUT|DELETE|PATCH)/);
  assert.match(owner, /role !== "owner"/);
  assert.match(state, /from\("feed_item_state"\)\.upsert/);
  const cover = readFileSync(new URL("../src/app/api/engines/mausbot/journal/cover/route.ts", import.meta.url), "utf8");
  assert.match(cover, /requireJournalOwner/);
  assert.doesNotMatch(read + cover, /og:image|resolveCover/);
  assert.doesNotMatch(state, /mausbotRequest|resolveMausbotConfig/);
  const mig = readFileSync(new URL("../supabase/migrations/20261025220000_atlas_feed_item_state.sql", import.meta.url), "utf8");
  assert.match(mig, /ENABLE ROW LEVEL SECURITY/);
  assert.match(mig, /UNIQUE \(user_id, workspace_id, edition_id, item_id\)/);
});
