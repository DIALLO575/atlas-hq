import assert from "node:assert/strict";
import test from "node:test";
import { journalEditionPeriod, journalEditionPresentation } from "../packages/engines/mausbot/src/journal-edition.mjs";
import { journalReadyEvent } from "../packages/engines/mausbot/src/activity-feed.mjs";

test("labels explicit morning, midday and evening editions", () => {
  assert.equal(journalEditionPresentation({ editionId: "2026-10-26-matin" }).title, "Journal du matin");
  assert.equal(journalEditionPresentation({ editionId: "2026-10-26-midi" }).title, "Journal de midi");
  assert.equal(journalEditionPresentation({ editionId: "2026-10-26-soir" }).title, "Journal du soir");
});

test("uses generated time in Conakry only when an edition has no explicit period", () => {
  assert.equal(journalEditionPeriod({ editionId: "edition-42", generatedAt: "2026-10-26T08:30:00Z" }), "morning");
  assert.equal(journalEditionPeriod({ editionId: "edition-42", generatedAt: "2026-10-26T12:30:00Z" }), "midday");
  assert.equal(journalEditionPeriod({ editionId: "edition-42", generatedAt: "2026-10-26T18:30:00Z" }), "evening");
  assert.equal(journalEditionPeriod({ editionId: "edition-42" }), "general");
});

test("activity notices name the actual edition", () => {
  assert.equal(journalReadyEvent("workspace", { edition_id: "2026-10-26-soir", item_count: 2, generated_at: "2026-10-26T20:00:00Z" })?.title, "Journal du soir prêt — 2 articles");
});
