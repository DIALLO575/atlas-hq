import test from "node:test";
import assert from "node:assert/strict";
import { notionDataSourceQueryRequest as query, notionPagePropertyRequest as property }
  from "../src/read-primitives.mjs";
import { createNotionReadClient, NotionReadError }
  from "../src/rest-client.mjs";
const ID = "123e4567-e89b-12d3-a456-426614174000";
const invalid = fn => assert.throws(fn, { code: "INVALID_INPUT" });
const response = (value, status = 200) => ({ ok: status >= 200 && status < 300,
  status, headers: new Headers(), json: async () => value });

test("property builder uses GET and fixed path with safe cursor", () => {
  const req = property({ pageId: ID, propertyId: "Status", startCursor: "next", size: 30 });
  assert.equal(req.method, "GET");
  assert.equal(req.path, "/v1/pages/" + ID +
    "/properties/Status?page_size=30&start_cursor=next");
});
test("property ID cannot traverse routes, even encoded", () => {
  const req = property({ pageId: ID, propertyId: "x%2Fy" });
  assert.equal(req.path, "/v1/pages/" + ID + "/properties/x%2Fy?page_size=30");
  for (const id of ["..", "%2e%2e", ".", "%ZZ", "\n", ""]) {
    invalid(() => property({ pageId: ID, propertyId: id }));
  }
  invalid(() => property({ pageId: "https://evil.test", propertyId: "Name" }));
});
test("page size and cursors cannot exceed server budget", () => {
  for (const startCursor of ["", "\nnext", "x".repeat(2049)])
    invalid(() => property({ pageId: ID, propertyId: "Name", startCursor }));
  for (const size of [0, 51, 1.5, NaN])
    invalid(() => property({ pageId: ID, propertyId: "Name", size }));
});
test("data_source query constructs only bounded read-only POST", () => {
  const req = query({ dataSourceId: ID, size: 12, startCursor: "next",
    filter: { property: "Status", select: { equals: "Done" } },
    sorts: [{ property: "Created", direction: "descending" }], isArchived: false });
  assert.equal(req.method, "POST");
  assert.equal(req.path, "/v1/data_sources/" + ID + "/query");
  assert.deepEqual(JSON.parse(JSON.stringify(req.body)), {
    page_size: 12, start_cursor: "next",
    filter: { property: "Status", select: { equals: "Done" } },
    sorts: [{ property: "Created", direction: "descending" }], is_archived: false });
});
test("filter supports bounded nested predicates and clones them", () => {
  const filter = { and: [
    { property: "Status", select: { equals: "Done" } },
    { property: "Priority", number: { greater_than: 2 } },
  ] };
  const req = query({ dataSourceId: ID, filter });
  filter.and[0].select.equals = "CHANGED";
  assert.equal(req.body.filter.and[0].select.equals, "Done");
});
test("query rejects nested injection, getters, cycles, unknown filter shapes", () => {
  const evil = JSON.parse('{"property":"Status","select":{"constructor":{"x":"y"}}}');
  invalid(() => query({ dataSourceId: ID, filter: evil }));
  invalid(() => query({ dataSourceId: ID, filter: { or: [] } }));
  invalid(() => query({ dataSourceId: ID, filter: { unknown: { equals: 1 } } }));
  invalid(() => query({ dataSourceId: ID,
    filter: { property: "Status", select: { equals: "x".repeat(513) } } }));
  const cycle = { property: "Status" }; cycle.self = cycle;
  invalid(() => query({ dataSourceId: ID, filter: cycle }));
  const accessor = { property: "Status" };
  Object.defineProperty(accessor, "select", {
    enumerable: true, get() { throw new Error("LEAK"); },
  });
  invalid(() => query({ dataSourceId: ID, filter: accessor }));
});
test("sort and archived values are bounded", () => {
  for (const sorts of [[{ property: "Status", direction: "up" }],
    [{ timestamp: "created_time", direction: "ascending", extra: 1 }],
    Array.from({ length: 6 }, () => ({ property: "X", direction: "ascending" }))])
    invalid(() => query({ dataSourceId: ID, sorts }));
  invalid(() => query({ dataSourceId: ID, isArchived: "true" }));
});
test("actual read client wires property/item/list and data source correctly", async () => {
  const calls = [];
  const client = createNotionReadClient({ token: "not-real-token", request: async (url,opts) => {
    calls.push({ url, opts });
    if (url.includes("/properties/")) return response({
      object: "property_item", type: "number", number: 3 });
    return response({ object: "list", results: [
      { object: "page", id: ID } ], has_more: false, next_cursor: null });
  } });
  const prop = await client.getPageProperty(ID, "Status", { size: 5 });
  assert.equal(prop.number, 3);
  const rows = await client.queryDataSource(ID, { size: 10,
    filter: { property: "Status", select: { equals: "Done" } } });
  assert.equal(rows.results.length, 1);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].opts.method, "GET");
  assert.equal(calls[1].opts.method, "POST");
  assert.equal(calls[1].url, "https://api.notion.com/v1/data_sources/" + ID + "/query");
  assert.equal(calls[1].opts.headers["Notion-Version"], "2026-03-11");
  assert.equal(calls[1].opts.headers.Authorization, "Bearer not-real-token");
});
test("client wraps invalid args, rejects malformed lists and never replays POST 503", async () => {
  let calls = 0;
  const client = createNotionReadClient({ token: "test", request: async () => {
    calls++; return response({}, 503);
  } });
  await assert.rejects(client.queryDataSource("https://evil.test"), err =>
    err instanceof NotionReadError && err.code === "INVALID_INPUT" && err.status === 400);
  await assert.rejects(client.queryDataSource(ID), { code: "PROVIDER_UNAVAILABLE" });
  assert.equal(calls, 1);
  const malformed = createNotionReadClient({ token: "test",
    request: async () => response({ object: "list", results: [], has_more: true }) });
  await assert.rejects(malformed.queryDataSource(ID), { code: "INVALID_RESPONSE" });
  await assert.rejects(malformed.getPageProperty(ID, "Status"), { code: "INVALID_RESPONSE" });
});
