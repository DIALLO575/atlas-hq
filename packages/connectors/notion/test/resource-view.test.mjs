import test from "node:test";
import assert from "node:assert/strict";
import { notionListView, notionBlockView, assertPersonalNotionConnection } from "../src/resource-view.mjs";
const id = "123e4567-e89b-12d3-a456-426614174000";
const actor = { workspaceId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  userId: "11111111-1111-4111-8111-111111111111" };
const registry = { id, workspace_id: actor.workspaceId, owner_id: actor.userId,
  provider: "notion", status: "connected" };
const connection = { connection_id: id, workspace_id: actor.workspaceId,
  user_id: actor.userId, revoked_at: null };
test("read context is actor-, workspace-, provider- and status-bound", () => {
  assert.equal(assertPersonalNotionConnection({ connection, registry, actor, connectionId: id }), true);
  for (const changed of [
    { connection: { ...connection, user_id: "another" } },
    { registry: { ...registry, owner_id: "another" } },
    { registry: { ...registry, provider: "linear" } },
    { registry: { ...registry, status: "disconnected" } },
    { connection: { ...connection, revoked_at: new Date().toISOString() } },
    { actor: { ...actor, workspaceId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" } },
  ]) {
    assert.throws(() => assertPersonalNotionConnection({
      connection, registry, actor, connectionId: id, ...changed,
    }), /NOTION_CONNECTION_FORBIDDEN/);
  }
});
test("search list exposes only whitelisted fields and title", () => {
  const view = notionListView({ has_more: false, next_cursor: null, results: [{
    id, object: "page", properties: { Name: { type: "title",
      title: [{ plain_text: "Release plan", sensitive_provider_value: "no" }] } },
    internal_private_token: "SHOULD_NOT_LEAK", last_edited_time: "2026-10-24",
  }] });
  assert.deepEqual(view.results, [{ id, kind: "page", title: "Release plan",
    editedAt: "2026-10-24" }]);
  assert.equal(JSON.stringify(view).includes("SHOULD_NOT_LEAK"), false);
});
test("block view returns bounded plain text, no original rich body", () => {
  const view = notionBlockView({ has_more: true, next_cursor: "next", results: [{
    id, type: "paragraph", has_children: true,
    paragraph: { rich_text: [{ plain_text: "Hello", href: "https://example.org/private" }] },
    secret_internal: "must-not-serialize",
  }] });
  assert.deepEqual(view.results, [{ id, type: "paragraph", text: "Hello", hasChildren: true }]);
  assert.equal(JSON.stringify(view).includes("must-not-serialize"), false);
});
test("malformed response is rejected, unsupported objects ignored", () => {
  assert.throws(() => notionListView({ results: [], has_more: true }), /NOTION_INVALID_RESPONSE/);
  assert.deepEqual(notionListView({ has_more: false, results: [
    { id, object: "user" },
  ] }).results, []);
});
