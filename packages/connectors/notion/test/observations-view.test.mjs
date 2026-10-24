import test from "node:test";
import assert from "node:assert/strict";
import { notionObservationListView } from "../src/observations-view.mjs";
const id = "123e4567-e89b-12d3-a456-426614174010";
const row = {
  connection_id: id, resource_kind: "page",
  resource_id: "55555555-5555-4555-8555-555555555555",
  notion_workspace_id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeee10",
  observed_at: "2026-10-24T15:00:00Z",
  source_updated_at: "2026-10-24T12:00:00Z",
  token: "never return", title: "private customer information",
  is_authorized: true,
};
test("historical observation view is whitelisted and explicitly non-authoritative", () => {
  const view = notionObservationListView([row]);
  assert.equal(view.length, 1);
  assert.equal(view[0].providerAccessVerifiedNow, false);
  assert.equal(JSON.stringify(view).includes("private customer"), false);
  assert.equal(JSON.stringify(view).includes("never return"), false);
  assert.equal(view[0].sourceUpdatedAt, row.source_updated_at);
});
test("rejects malformed rows, unsupported kinds and oversized lists", () => {
  const view = notionObservationListView([
    { ...row, resource_kind: "admin" },
    { ...row, resource_id: "missing" },
    { ...row, source_updated_at: "unknown" },
    row, row,
  ], 1);
  assert.equal(view.length, 0);
  assert.throws(() => notionObservationListView([row], 21), /NOTION_OBSERVATIONS_INVALID/);
});
