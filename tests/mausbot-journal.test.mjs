import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { normalizeJournalTopic, parseJournalJson, parseJournalMarkdown, groupJournal, JOURNAL_CATEGORIES } from "../packages/engines/mausbot/src/journal.mjs";
import { isPrivateAddress, assertPublicUrl, safeFetch, extractOgImage, resolveCover } from "../packages/engines/mausbot/src/journal-images.mjs";
import { resolveJournalSource, readJournalEdition, validateJournalStateInput, JOURNAL_FIXTURE } from "../packages/engines/mausbot/src/journal-source.mjs";

const pub = async () => [{ address: "93.184.216.34" }];

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
    { id: "a", topic: "ia", title: "T", summary: "S", certainty: "elevee", status: "confirme", source_url: "https://x.com/a", image_url: "javascript:alert(1)", extra_sources: [{ url: "file:///etc/passwd" }, { url: "https://y.org/b", name: "Y" }] },
    { id: "b", topic: "sport", title: "ignored" },
    { id: "a", topic: "ia", title: "dup" },
    { id: "bad id!", topic: "ia", title: "x" },
    { id: "c", topic: "economie", title: "E", certainty: "wat", unknownField: 1 },
  ] });
  assert.equal(e.items.length, 2);
  assert.equal(e.skipped, 3);
  assert.equal(e.items[0].imageUrl, null);
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

test("SSRF: private, loopback, metadata, mapped and non-http targets refused", async () => {
  for (const ip of ["127.0.0.1", "10.0.0.1", "172.16.5.4", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "::1", "fd00::1", "fe80::1", "::ffff:127.0.0.1"])
    assert.equal(isPrivateAddress(ip), true, ip);
  assert.equal(isPrivateAddress("93.184.216.34"), false);
  for (const u of ["ftp://x.com/a", "http://localhost/a", "http://127.0.0.1/", "http://[::1]/", "https://u:p@x.com/", "http://x.com:8080/"])
    await assert.rejects(assertPublicUrl(u, { lookup: pub }), u);
  await assert.rejects(assertPublicUrl("https://evil.example/", { lookup: async () => [{ address: "10.1.2.3" }] }));
  await assertPublicUrl("https://news.example/a", { lookup: pub });
});

test("safeFetch re-validates redirects and caps size", async () => {
  const redirect = async () => new Response(null, { status: 302, headers: { location: "http://169.254.169.254/latest" } });
  await assert.rejects(safeFetch("https://news.example/", { fetchImpl: redirect, lookup: async h => h === "news.example" ? pub() : [{ address: h }] }));
  const big = async () => new Response("x".repeat(2000), { status: 200 });
  await assert.rejects(safeFetch("https://news.example/", { fetchImpl: big, lookup: pub, maxBytes: 100 }), /TOO_LARGE/);
});

test("og:image extraction and cover fallback chain", async () => {
  const html = `<html><head><meta content="/img/cover.jpg?a=1&amp;b=2" property="og:image"></head></html>`;
  assert.equal(extractOgImage(html, "https://news.example/a"), "https://news.example/img/cover.jpg?a=1&b=2");
  assert.equal(extractOgImage(`<meta property="og:image" content="javascript:x">`, "https://n.example/"), null);
  const fetchImpl = async url => url.includes("/img/")
    ? new Response("img", { headers: { "content-type": "image/jpeg" } })
    : new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
  const item = { imageUrl: null, sourceUrl: "https://news.example/a", title: "T", category: "ia", summary: "" };
  assert.deepEqual(await resolveCover(item, { fetchImpl, lookup: pub }), { url: "https://news.example/img/cover.jpg?a=1&b=2", generated: false, origin: "og" });
  const notImage = async () => new Response("<html></html>", { headers: { "content-type": "text/html" } });
  const provider = { name: "t", generate: async () => ({ url: "https://gen.example/x.webp" }) };
  assert.deepEqual(await resolveCover(item, { fetchImpl: notImage, lookup: pub, provider }), { url: "https://gen.example/x.webp", generated: true, origin: "generated" });
  assert.deepEqual(await resolveCover(item, { fetchImpl: notImage, lookup: pub }), { url: null, generated: true, origin: "placeholder" });
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
  assert.doesNotMatch(state, /mausbotRequest|resolveMausbotConfig/);
  const mig = readFileSync(new URL("../supabase/migrations/20261025220000_atlas_feed_item_state.sql", import.meta.url), "utf8");
  assert.match(mig, /ENABLE ROW LEVEL SECURITY/);
  assert.match(mig, /UNIQUE \(user_id, workspace_id, edition_id, item_id\)/);
});
