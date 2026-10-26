import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import ts from "typescript";
import { parseBlocks, parseInline, readingMinutes, pickFeatured, stepFont, swipeDirection, neighbor, bulkDonePlan, safeLink } from "../packages/engines/mausbot/src/journal-reader.mjs";
import { normalizeActivity, journalReadyEvent } from "../packages/engines/mausbot/src/activity-feed.mjs";
import { validateJournalEdition, parseJournalJson } from "../packages/engines/mausbot/src/journal.mjs";
import { JOURNAL_FIXTURE } from "../packages/engines/mausbot/src/journal-source.mjs";

const root = new URL("../", import.meta.url);
const read = p => readFileSync(new URL(p, root), "utf8");

test("rich text: lists, quotes, links; unsafe links and HTML stay inert", () => {
  const b = parseBlocks("Intro **fort** et _léger_.\n- un\n- deux\n\n1. a\n2) b\n> cité [src](https://ex.com/a)\n<script>alert(1)</script> [x](javascript:alert(1))");
  assert.deepEqual(b.map(x => x.type), ["p", "ul", "ol", "quote", "p"]);
  assert.deepEqual(b[0].inline.map(t => t.t), ["text", "strong", "text", "em", "text"]);
  assert.equal(b[3].inline.find(t => t.t === "link").href, "https://ex.com/a");
  const last = b[4].inline;
  assert.ok(last.every(t => t.t === "text"));
  assert.match(last.map(t => t.v).join(""), /<script>/);
  assert.equal(safeLink("javascript:alert(1)"), null);
  assert.equal(parseInline("voir https://www.example.org/x").at(-1).v, "example.org");
});

test("rich text renders escaped React output (no raw HTML)", async () => {
  const src = read("src/components/journal-rich-text.tsx").replaceAll("../../packages/engines/mausbot/src/journal-reader.mjs", new URL("packages/engines/mausbot/src/journal-reader.mjs", root).href);
  const out = ts.transpileModule(src, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  const dir = mkdtempSync(join(tmpdir(), "mj-"));
  const file = join(dir, "rich.mjs");
  const require = createRequire(new URL("package.json", root));
  writeFileSync(file, out.replaceAll('"react/jsx-runtime"', JSON.stringify(pathToFileURL(require.resolve("react/jsx-runtime")).href)));
  const { RichText } = await import(pathToFileURL(file).href);
  const React = require("react"), { renderToStaticMarkup } = require("react-dom/server");
  const html = renderToStaticMarkup(React.createElement(RichText, { className: "mj-prose", text: "A <img src=x onerror=alert(1)>\n- un\n> q [l](https://ex.com)" }));
  assert.match(html, /^<div class="mj-prose"><p>/);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.match(html, /<ul><li><span>un<\/span><\/li><\/ul>/);
  assert.match(html, /<blockquote>.*<a href="https:\/\/ex.com" target="_blank" rel="noopener noreferrer nofollow">l<\/a>/);
  assert.doesNotMatch(read("src/components/morning-journal.tsx") + read("src/components/journal-rich-text.tsx"), /dangerouslySetInnerHTML/);
});

test("reading helpers", () => {
  assert.equal(readingMinutes("mot ".repeat(10)), 1);
  assert.equal(readingMinutes("mot ".repeat(660)), 3);
  assert.equal(pickFeatured([{ id: "a" }, { id: "b", featured: true }]).id, "b");
  assert.equal(pickFeatured([{ id: "a" }, { id: "b" }]).id, "a");
  assert.equal(pickFeatured([]), null);
  assert.equal(stepFont(4, 1), 4); assert.equal(stepFont(0, -1), 0); assert.equal(stepFont(1, 1), 2);
  assert.equal(swipeDirection(-100, 10), 1); assert.equal(swipeDirection(100, 10), -1);
  assert.equal(swipeDirection(-100, 90), 0); assert.equal(swipeDirection(-30, 0), 0);
  const list = [{ id: "a" }, { id: "b" }];
  assert.equal(neighbor(list, "a", 1).id, "b"); assert.equal(neighbor(list, "a", -1), null);
  const editions = [{ id: "same", key: "m:same", editionId: "m", category: "ia", state: "new" }, { id: "same", key: "g:same", editionId: "g", category: "ia", state: "read" }];
  assert.equal(neighbor(editions, "g:same", -1).editionId, "m");
  assert.deepEqual(bulkDonePlan(editions, "ia"), [{ key: "m:same", id: "same", editionId: "m", previous: "new" }, { key: "g:same", id: "same", editionId: "g", previous: "read" }]);
  const plan = bulkDonePlan([{ id: "a", editionId: "e", category: "ia", state: "new" }, { id: "b", editionId: "e", category: "ia", state: "done" }, { id: "c", editionId: "e", category: "monde", state: "read" }], "ia");
  assert.deepEqual(plan, [{ key: JSON.stringify(["e", "a"]), id: "a", editionId: "e", previous: "new" }]);
});

test("contract v1: optional featured is backward compatible", () => {
  assert.equal(validateJournalEdition(JOURNAL_FIXTURE).ok, true);
  const d = structuredClone(JOURNAL_FIXTURE); delete d.items[0].featured;
  assert.equal(validateJournalEdition(d).ok, true);
  d.items[0].featured = "yes";
  assert.equal(validateJournalEdition(d).ok, false);
  const schema = JSON.parse(read("packages/engines/mausbot/schema/journal-edition.v1.schema.json"));
  const it = schema.properties.items.items;
  assert.equal(it.properties.featured.type, "boolean");
  assert.ok(!it.required.includes("featured"));
  assert.equal(parseJournalJson(JOURNAL_FIXTURE).items[0].featured, true);
  assert.match(read("supabase/migrations/20261025224000_atlas_journal_featured.sql"), /ADD COLUMN IF NOT EXISTS featured boolean NOT NULL DEFAULT false/);
});

test("inbox activity feed: allow-list, unknown types ignored, safe hrefs", () => {
  const ev = journalReadyEvent("ws 1", { edition_id: "2026-10-25_matin", item_count: 12, generated_at: "2026-10-25T13:00:00Z" });
  assert.equal(ev.title, "Journal du matin prêt — 12 articles");
  assert.equal(ev.href, "/journal?workspaceId=ws%201");
  assert.equal(journalReadyEvent("w", { edition_id: "e", item_count: 1 }).title, "Journal du matin prêt — 1 article");
  assert.equal(journalReadyEvent("w", null), null);
  const out = normalizeActivity([ev, { ...ev }, { type: "mystery", id: "x", href: "/x" }, { type: "journal_ready", id: "y", href: "//evil.com" }, null]);
  assert.deepEqual(out.map(e => e.id), ["journal:2026-10-25_matin"]);
  const inbox = read("src/app/inbox/page.tsx");
  assert.match(inbox, /<ActivityFeed workspaceId=\{data.selected.id\} \/>\n\s+<MausbotNeedsYou/);
  assert.doesNotMatch(read("src/components/activity-feed.tsx"), /mausbot-needs-you/);
});

test("service worker: journal-only offline cache, expired signed URLs stripped", () => {
  const require = createRequire(import.meta.url);
  const core = require("../public/journal-sw-core.js");
  const now = Date.parse("2026-10-25T14:00:00Z");
  const payload = { items: [{ id: "a", coverUrl: "https://p.supabase.co/sign/x" }], coverExpiresAt: "2026-10-25T14:30:00Z" };
  assert.equal(core.sanitizeOffline(payload, now).items[0].coverUrl, "https://p.supabase.co/sign/x");
  assert.equal(core.sanitizeOffline(payload, now).offline, true);
  assert.equal(core.sanitizeOffline({ ...payload, coverExpiresAt: "2026-10-25T14:00:30Z" }, now).items[0].coverUrl, null);
  assert.equal(core.sanitizeOffline({ ...payload, coverExpiresAt: null }, now).items[0].coverUrl, null);
  assert.equal(core.sanitizeOffline({ nope: 1 }, now), null);
  assert.equal(core.isJournalApi(new URL("https://a.b/api/engines/mausbot/journal?workspaceId=1")), true);
  assert.equal(core.isJournalApi(new URL("https://a.b/api/engines/mausbot/journal/state")), false);
  assert.equal(core.isJournalPage(new URL("https://a.b/journal")), true);
  assert.equal(core.isJournalPage(new URL("https://a.b/inbox")), false);
  const h = ct => ({ ok: true, headers: { get: () => ct } });
  assert.equal(core.shouldStore(h("application/json; charset=utf-8")), true);
  assert.equal(core.shouldStore(h("text/html")), false);
  assert.equal(core.shouldStore({ ok: false, headers: { get: () => "application/json" } }), false);
  const sw = read("public/sw.js");
  assert.match(sw, /importScripts\("\/journal-sw-core.js"\)/);
  assert.doesNotMatch(sw, /journal\/state/);
  assert.match(sw, /cache\.delete\(r\)/); // bounded public asset cache; private editions live in scoped IndexedDB
  assert.match(read("src/proxy.ts"), /sw\\\\\.js\$\|journal-sw-core\\\\\.js\$/);
});

test("journal PWA manifest + viewport-fit cover + main manifest shortcut", () => {
  const m = JSON.parse(read("public/journal.webmanifest"));
  assert.equal(m.start_url, "/journal"); assert.equal(m.display, "standalone"); assert.ok(m.theme_color && m.icons.length >= 2);
  assert.ok(JSON.parse(read("public/manifest.webmanifest")).shortcuts.some(s => s.url === "/journal"));
  const page = read("src/app/journal/page.tsx");
  assert.match(page, /viewportFit: "cover"/); assert.match(page, /manifest: "\/journal.webmanifest"/);
  const css = read("src/app/morning-journal.css");
  assert.match(css, /env\(safe-area-inset-bottom\)/); assert.match(css, /min-height:44px/); assert.match(css, /max-width:68ch/); assert.match(css, /line-height:1.7/);
});

test("normalization keeps line breaks for prose fields", () => {
  const it = parseJournalJson(JOURNAL_FIXTURE).items[0];
  assert.match(it.summary, /:\n- poids/);
  assert.equal(parseBlocks(it.summary)[1].type, "ul");
});
