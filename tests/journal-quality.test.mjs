import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { checkEdition, checkEditionMissing, QUALITY_CHECKS } from "../packages/engines/mausbot/src/journal-quality.mjs";
import { JOURNAL_FIXTURE } from "../packages/engines/mausbot/src/journal-source.mjs";

const cover = { storage_path: "e/x.webp", generated: true, alt: "", credit: null, source_name: null };
const ed = () => { const d = structuredClone(JOURNAL_FIXTURE); d.items.forEach(i => { i.cover = cover; }); return d; };

test("clean edition is ok and complete", () => {
  const r = checkEdition(ed());
  assert.deepEqual(r.checks, []); assert.equal(r.ok, true); assert.equal(r.complete, true);
});
test("missing cover, missing source, duplicates", () => {
  const d = ed(); d.items[0].cover = null; d.items[1].source_url = "nope"; d.items[2].title = d.items[0].title.toUpperCase() + " !";
  const r = checkEdition(d);
  const kinds = r.checks.map(c => c.check);
  assert.ok(kinds.includes("missing_cover") && kinds.includes("missing_source") && kinds.includes("duplicate_in_edition") && kinds.includes("contract_invalid"));
  assert.equal(r.ok, false); assert.equal(r.complete, false); assert.equal(r.counts.withoutCover, 1);
});
test("duplicate across editions ignores same edition", () => {
  const prev = [{ edition_id: "old", source_url: "https://www.example.com/ia/", title: "x" }, { edition_id: JOURNAL_FIXTURE.edition_id, source_url: "https://example.com/fret" }];
  const r = checkEdition(ed(), { previousItems: prev });
  assert.deepEqual(r.checks.map(c => [c.check, c.item_id]), [["duplicate_across_editions", "ia-1"]]);
  assert.equal(r.ok, true);
});
test("late arrival and missing edition watchdog", () => {
  const r = checkEdition(ed(), { expectedBy: "2026-10-25T13:00:00Z", receivedAt: "2026-10-25T13:45:00Z" });
  assert.match(r.checks[0].detail, /45 min/);
  assert.equal(checkEditionMissing({ lastGeneratedAt: null, expectedBy: "2026-10-25T13:00:00Z", now: "2026-10-25T12:00:00Z" }), null);
  assert.equal(checkEditionMissing({ lastGeneratedAt: "2026-10-24T13:00:00Z", expectedBy: "2026-10-25T13:00:00Z", now: "2026-10-25T14:00:00Z" })?.severity, "error");
  assert.equal(checkEditionMissing({ lastGeneratedAt: "2026-10-25T12:50:00Z", expectedBy: "2026-10-25T13:00:00Z", now: "2026-10-25T14:00:00Z" }), null);
});
test("journal-mcp v1 schema: 6 tools, checks enum and SQL aligned", () => {
  const s = JSON.parse(readFileSync(new URL("../packages/engines/mausbot/schema/journal-mcp.v1.schema.json", import.meta.url), "utf8"));
  assert.deepEqual(Object.keys(s.tools), ["publish_edition", "get_edition", "search_items", "set_item_state", "correct_item", "edition_status"]);
  assert.deepEqual(s["x-producers"], ["morgans", "grok-bot"]);
  assert.deepEqual(s.tools.publish_edition.output.oneOf[0].properties.checks.items.properties.check.enum, [...QUALITY_CHECKS]);
  const sql = readFileSync(new URL("../supabase/migrations/20261025223000_atlas_journal_audit.sql", import.meta.url), "utf8");
  for (const c of QUALITY_CHECKS) assert.match(sql, new RegExp("'" + c + "'"));
  assert.doesNotMatch(sql, /GRANT (INSERT|UPDATE|DELETE)[^;]*authenticated/);
});
