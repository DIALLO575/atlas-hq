import test from "node:test";
import assert from "node:assert/strict";
import { createNotionReadClient, NotionReadError } from "../src/rest-client.mjs";
import { notionViewsList, notionViewPreview, safeNotionUrl, notionListView }
  from "../src/resource-view.mjs";

const ID = "123e4567-e89b-12d3-a456-426614174000";
const VIEW = "22222222-2222-4222-8222-222222222222";
const reply = data => ({ ok: true, status: 200, json: async () => data });
test("list views keeps Notion fixed origin, selected database and pagination limits", async () => {
  const calls = [];
  const client = createNotionReadClient({ token: "private-token",
    request: async (url, options) => {
      calls.push({ url, options });
      return reply({ object: "list", results: [{ object: "view", id: VIEW }],
        has_more: false, next_cursor: null });
    },
  });
  const result = await client.listViews({ sourceKind: "database", resourceId: ID,
    startCursor: "page-next", size: 8 });
  assert.equal(result.results.length, 1);
  const url = new URL(calls[0].url);
  assert.equal(url.origin, "https://api.notion.com");
  assert.equal(url.pathname, "/v1/views");
  assert.equal(url.searchParams.get("database_id"), ID);
  assert.equal(url.searchParams.get("page_size"), "8");
  assert.equal(url.searchParams.get("start_cursor"), "page-next");
  assert.equal(calls[0].options.method, "GET");
  assert.equal(calls[0].options.headers.Authorization, "Bearer private-token");
});
test("list views supports data sources and never accepts attacker-controlled paths", async () => {
  const seen = [];
  const client = createNotionReadClient({ token: "private-token",
    request: async (url) => { seen.push(url); return reply({
      results: [], has_more: false, next_cursor: null,
    }); },
  });
  await client.listViews({ sourceKind: "data_source", resourceId: ID });
  assert.equal(new URL(seen[0]).searchParams.get("data_source_id"), ID);
  for (const invalid of [
    { sourceKind: "page", resourceId: ID },
    { sourceKind: "database", resourceId: "https://attacker.test" },
    { sourceKind: "database", resourceId: ID, size: 101 },
    { sourceKind: "database", resourceId: ID, startCursor: "" },
  ]) {
    await assert.rejects(client.listViews(invalid), { code: "INVALID_INPUT" });
  }
  assert.equal(seen.length, 1);
});
test("view retrieve and preview are fixed-origin, bounded and do not mutate Notion content", async () => {
  const requests = [];
  const client = createNotionReadClient({ token: "secret",
    request: async (url, options) => {
      requests.push({ url, options });
      if (options.method === "GET") {
        return reply({ object: "view", id: VIEW, name: "En cours", type: "board" });
      }
      return reply({ object: "view_query", id: "query-only",
        results: [{ object: "page", id: ID, url: "https://www.notion.so/" + ID }],
        has_more: false, total_count: 1 });
    },
  });
  assert.equal((await client.getView(VIEW)).type, "board");
  const snapshot = await client.previewView(VIEW, { size: 12 });
  assert.equal(snapshot.results.length, 1);
  assert.equal(requests[1].url, "https://api.notion.com/v1/views/" + VIEW + "/queries");
  assert.equal(requests[1].options.method, "POST");
  assert.deepEqual(JSON.parse(requests[1].options.body), { page_size: 12 });
  assert.equal(requests.some(req => ["PATCH", "PUT", "DELETE"].includes(req.options.method)), false);
  await assert.rejects(client.previewView("not-an-id"), { code: "INVALID_INPUT" });
  assert.equal(requests.length, 2);
});
test("rejects malformed preview, provider refusal and never exposes response content", async () => {
  const client = createNotionReadClient({ token: "secret", request: async () => reply({
    object: "view", results: [], has_more: false,
  }) });
  await assert.rejects(client.previewView(VIEW), { code: "INVALID_RESPONSE" });
  const denied = createNotionReadClient({ token: "secret",
    request: async () => ({ ok: false, status: 404, headers: new Headers(),
      json: async () => ({ access_token: "PRIVATE" }) }),
  });
  await assert.rejects(denied.listViews({ sourceKind: "database", resourceId: ID }),
    error => error instanceof NotionReadError &&
      error.code === "NOT_FOUND_OR_HIDDEN" && !error.message.includes("PRIVATE"));
});
test("sanitizes view metadata, external links, and nested provider fields", () => {
  const raw = { object: "list", results: [
    { object: "view", id: VIEW, name: "Vision", type: "board",
      url: "https://www.notion.so/" + VIEW,
      token: "SHOULD_NOT_LEAK", configuration: { secret: "KEEP_PRIVATE" } },
  ], has_more: false, next_cursor: null };
  const result = notionViewsList(raw);
  assert.deepEqual(result.results, [{ id: VIEW, name: "Vision", type: "board",
    url: "https://www.notion.so/" + VIEW, editedAt: null }]);
  assert.equal(JSON.stringify(result).includes("SHOULD_NOT_LEAK"), false);
  assert.equal(JSON.stringify(result).includes("KEEP_PRIVATE"), false);
  assert.equal(safeNotionUrl("https://attacker.test/" + VIEW), null);
  assert.equal(safeNotionUrl("javascript:alert(1)"), null);
  assert.equal(safeNotionUrl("https://www.notion.so.attacker.test/"), null);
  assert.equal(safeNotionUrl("https://user:pass@notion.so/"), null);
  assert.equal(safeNotionUrl("https://www.notion.so:4444/path"), null);
});
test("preview includes only whitelisted page fields, not cached provider payload", () => {
  const raw = { object: "view_query", id: "secret-query-id", has_more: true,
    total_count: 47, results: [{ object: "page", id: ID,
      url: "https://www.notion.so/" + ID,
      properties: { Name: { type: "title", title: [{ plain_text: "Active" }] },
        Secret: { rich_text: [{ plain_text: "DO_NOT_RETURN" }] } },
      access_token: "NOPE" }],
  };
  const safe = notionViewPreview(raw);
  assert.equal(safe.totalCount, 47);
  assert.equal(safe.hasMore, true);
  assert.deepEqual(safe.results, notionListView({ results: raw.results,
    has_more: false, next_cursor: null }).results);
  assert.equal(JSON.stringify(safe).includes("secret-query-id"), false);
  assert.equal(JSON.stringify(safe).includes("DO_NOT_RETURN"), false);
  assert.equal(JSON.stringify(safe).includes("NOPE"), false);
});
