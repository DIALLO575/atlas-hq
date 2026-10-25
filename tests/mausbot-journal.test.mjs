import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { validateJournalEdition, journalItemsFromRows, journalItemKey, normalizeCover, normalizeJournalTopic, parseJournalJson, parseJournalMarkdown, groupJournal, JOURNAL_CATEGORIES } from "../packages/engines/mausbot/src/journal.mjs";
import { journalDemoAllowed, readJournalDemo, readJournalFromSupabase, validateJournalStateInput, JOURNAL_FIXTURE } from "../packages/engines/mausbot/src/journal-source.mjs";


test("topics normalize to seven categories, including IA sur X, unknown → null", () => {
  assert.equal(JOURNAL_CATEGORIES.length, 7);
  assert.equal(JOURNAL_CATEGORIES.find(c => c.id === "ia-sur-x").label, "IA sur X");
  assert.equal(normalizeJournalTopic("ia"), "ia");
  assert.equal(normalizeJournalTopic("IA & outils"), "ia");
  assert.equal(normalizeJournalTopic("ia-sur-x"), "ia-sur-x");
  assert.equal(normalizeJournalTopic("X"), "ia-sur-x");
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
    { id: "a", topic: "ia", title: "T", summary: "S", certainty: "elevee", status: "confirme", source_url: "https://x.com/a", cover: { storage_path: "../etc/passwd.png", generated: true }, extra_sources: [{ url: "file:///etc/passwd" }, { url: "https://y.org/b", name: "Y" }] },
    { id: "b", topic: "sport", title: "ignored" },
    { id: "a", topic: "ia", title: "dup" },
    { id: "bad id!", topic: "ia", title: "x" },
    { id: "c", topic: "economie", title: "E", certainty: "wat", unknownField: 1, cover: { storage_path: "ed1/radar-c.webp", generated: true, alt: "A", credit: "Reuters", source_name: "Reuters" } },
  ] });
  assert.equal(e.items.length, 2);
  assert.equal(e.skipped, 3);
  assert.equal(e.items[0].cover, null);
  assert.deepEqual(e.items[1].cover, { storagePath: "ed1/radar-c.webp", generated: true, alt: "A", credit: "Reuters", sourceName: "Reuters" });
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

test("cover: bucket-relative storage_path only", () => {
  assert.equal(normalizeCover({ storage_path: "https://evil.example/x.png" }), null);
  assert.equal(normalizeCover({ storage_path: "x.png" }), null);
  assert.equal(normalizeCover({ storage_path: "a/../b.png" }), null);
  assert.equal(normalizeCover({ storage_path: "e/x.svg" }), null);
  assert.equal(normalizeCover({ storage_path: "e/x.jpeg", generated: "true" }).generated, false);
});

test("contract v1: JSON Schema and validator agree; strict rejection", () => {
  const schema = JSON.parse(readFileSync(new URL("../packages/engines/mausbot/schema/journal-edition.v1.schema.json", import.meta.url), "utf8"));
  const itemSchema = schema.properties.items.items;
  assert.equal(schema.properties.schema_version.const, "1");
  assert.deepEqual(itemSchema.properties.topic.enum, ["ia", "ia-sur-x", "commerce", "guinee", "afrique", "monde", "geopolitique", "economie", "tech"]);
  assert.deepEqual(itemSchema.properties.cover.oneOf[1].required, ["storage_path", "generated", "alt", "credit", "source_name"]);
  assert.equal(schema.additionalProperties, false);
  assert.deepEqual(validateJournalEdition(JOURNAL_FIXTURE), { ok: true, errors: [] });
  const good = structuredClone(JOURNAL_FIXTURE);
  good.items[0].topic = "ia-sur-x";
  good.items[0].cover = { storage_path: "demo/ia-1.webp", generated: false, alt: "x", credit: "AFP", source_name: "Le Monde" };
  assert.equal(validateJournalEdition(good).ok, true);
  for (const mutate of [
    d => { d.schema_version = "2"; }, d => { d.extra = 1; }, d => { d.producer = "x"; }, d => { d.items = []; },
    d => { d.items[0].topic = "sport"; }, d => { d.items[0].unknown = 1; }, d => { d.items[1].id = d.items[0].id; },
    d => { delete d.items[0].cover; }, d => { d.items[0].cover = { storage_path: "a/b.webp" }; },
    d => { d.items[0].source_url = "javascript:x"; }, d => { d.items[0].certainty = "haute"; },
  ]) { const d = structuredClone(JOURNAL_FIXTURE); mutate(d); assert.equal(validateJournalEdition(d).ok, false, String(mutate)); }
});

function fakeSupabase({ editions, rowsByEdition, signedCalls }) {
  return {
    from: table => {
      const filters = {};
      let order = null, limit = Infinity;
      const matching = () => {
        const source = table === "journal_editions" ? editions : Object.values(rowsByEdition).flat();
        const result = source.filter(row => Object.entries(filters).every(([key, value]) => row[key] === value));
        if (order) result.sort((a, c) => (a[order.column] < c[order.column] ? -1 : a[order.column] > c[order.column] ? 1 : 0) * (order.ascending ? 1 : -1));
        return result.slice(0, limit);
      };
      const b = {
        select: () => b,
        eq: (column, value) => { filters[column] = value; return b; },
        order: (column, opts) => { order = { column, ascending: opts.ascending }; return b; },
        limit: value => { limit = value; return b; },
        maybeSingle: async () => ({ data: matching()[0] ?? null, error: null }),
        then: (resolve, reject) => Promise.resolve({ data: matching(), error: null }).then(resolve, reject),
      };
      return b;
    },
    storage: { from: bucket => ({ createSignedUrls: async (paths, ttl) => { signedCalls.push({ bucket, paths, ttl }); return { data: paths.map(p => ({ path: p, signedUrl: "https://proj.supabase.co/storage/v1/object/sign/" + p + "?token=t", error: null })) }; } }) },
  };
}

test("Supabase reader: merges each producer's latest edition, keeps MORGANS first and signs both covers", async () => {
  const signedCalls = [];
  const editions = [
    { workspace_id: "ws-1", edition_id: "morgans-old", generated_at: "2026-10-25T12:00:00Z", producer: "morgans", schema_version: "1" },
    { workspace_id: "ws-1", edition_id: "morgans-current", generated_at: "2026-10-25T13:00:00Z", producer: "morgans", schema_version: "1" },
    { workspace_id: "ws-1", edition_id: "grok-new", generated_at: "2026-10-25T14:00:00Z", producer: "grok-bot", schema_version: "1" },
  ];
  const row = (editionId, title, topic, path) => ({ workspace_id: "ws-1", edition_id: editionId, item_id: "same-id", topic, title, summary: "S", certainty: "elevee", status: "confirme", source_url: "https://x.com", source_name: "X", extra_sources: [], cover: { storage_path: path, generated: true, alt: "", credit: null, source_name: null }, position: 0 });
  const rowsByEdition = {
    "morgans-old": [row("morgans-old", "old item", "ia", "old/cover.webp")],
    "morgans-current": [row("morgans-current", "MORGANS item", "ia", "morgans/cover.webp"), { workspace_id: "ws-1", edition_id: "morgans-current", item_id: "bad", topic: "sport", title: "x" }],
    "grok-new": [row("grok-new", "Grok item", "ia-sur-x", "grok/cover.webp")],
  };
  const sb = fakeSupabase({ editions, rowsByEdition, signedCalls });
  const e = await readJournalFromSupabase(sb, "ws-1");
  assert.equal(e.items.length, 2);
  assert.equal(e.producer, "morgans+grok-bot");
  assert.equal(e.editionId, "grok-new");
  assert.deepEqual(e.items.map(i => [i.title, i.editionId, i.key]), [
    ["MORGANS item", "morgans-current", journalItemKey("morgans-current", "same-id")],
    ["Grok item", "grok-new", journalItemKey("grok-new", "same-id")],
  ]);
  assert.equal(signedCalls[0].bucket, "journal-covers");
  assert.deepEqual(signedCalls[0].paths, ["ws-1/morgans/cover.webp", "ws-1/grok/cover.webp"]);
  assert.equal(signedCalls[0].ttl, 3600);
  assert.match(e.items[0].coverUrl, /^https:\/\/proj\.supabase\.co\/storage\/v1\/object\/sign\/ws-1\/morgans\/cover\.webp/);
  assert.match(e.items[1].coverUrl, /^https:\/\/proj\.supabase\.co\/storage\/v1\/object\/sign\/ws-1\/grok\/cover\.webp/);
  await assert.rejects(readJournalFromSupabase(fakeSupabase({ editions: [], rowsByEdition: {}, signedCalls }), "ws-1"), /NOT_FOUND/);
  await assert.rejects(readJournalFromSupabase(fakeSupabase({ editions: [{ workspace_id: "ws-1", edition_id: "e", producer: "morgans", schema_version: "2" }], rowsByEdition: {}, signedCalls }), "ws-1"), /UNSUPPORTED/);
  assert.equal(journalItemsFromRows("e", null).length, 0);
});

test("demo fixture never in production", () => {
  assert.equal(journalDemoAllowed({ ATLAS_MAUSBOT_JOURNAL_DEMO: "true", VERCEL_ENV: "production" }), false);
  assert.equal(journalDemoAllowed({ ATLAS_MAUSBOT_JOURNAL_DEMO: "true", NODE_ENV: "production" }), false);
  assert.equal(journalDemoAllowed({}), false);
  assert.equal(journalDemoAllowed({ ATLAS_MAUSBOT_JOURNAL_DEMO: "true" }), true);
  const demo = readJournalDemo();
  assert.equal(demo.demo, true);
  assert.equal(demo.producer, "morgans");
  assert.deepEqual(demo.items.map(i => i.id), JOURNAL_FIXTURE.items.map(i => i.id));
  assert.ok(demo.items.every(i => i.key === journalItemKey(i.editionId, i.id)));
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
  assert.match(read, /\.in\("edition_id", editionIds\)/);
  assert.match(read, /stateMap\[i\.key\]/);
  assert.match(state, /from\("feed_item_state"\)\.upsert/);
  assert.doesNotMatch(read + state, /mausbotRequest|resolveMausbotConfig|ATLAS_MAUSBOT_JOURNAL_URL|og:image/);
  const ed = readFileSync(new URL("../supabase/migrations/20261025221000_atlas_journal_editions.sql", import.meta.url), "utf8");
  assert.match(ed, /'journal-covers', 'journal-covers', false/);
  assert.match(ed, /GRANT SELECT ON public.journal_editions, public.journal_items TO authenticated;/);
  assert.doesNotMatch(ed, /GRANT (INSERT|UPDATE|DELETE)[^;]*authenticated/);
  assert.doesNotMatch(state, /mausbotRequest|resolveMausbotConfig/);
  const mig = readFileSync(new URL("../supabase/migrations/20261025220000_atlas_feed_item_state.sql", import.meta.url), "utf8");
  assert.match(mig, /ENABLE ROW LEVEL SECURITY/);
  assert.match(mig, /UNIQUE \(user_id, workspace_id, edition_id, item_id\)/);
});
