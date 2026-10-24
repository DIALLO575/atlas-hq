import test from "node:test";
import assert from "node:assert/strict";
import {
  createNotionReadClient, NotionReadError, NOTION_API_VERSION,
} from "../src/rest-client.mjs";

const ID = "123e4567-e89b-12d3-a456-426614174000";
const response = (value, status = 200, headers = new Headers()) =>
  ({ ok: status >= 200 && status < 300, status, headers,
    json: async () => value });
const LIST = { results: [{ object: "page", id: ID }], has_more: false, next_cursor: null };

test("does not perform network calls during construction", () => {
  let called = false;
  createNotionReadClient({ token: "test-secret", request: async () => { called = true; } });
  assert.equal(called, false);
});
test("enforces fixed origin, current API version, GET for page", async () => {
  const calls = [];
  const client = createNotionReadClient({ token: "secret", request: async (url, opts) => {
    calls.push({ url, opts }); return response({ object: "page", id: ID });
  } });
  await client.getPage(ID);
  assert.equal(calls[0].url, "https://api.notion.com/v1/pages/" + ID);
  assert.equal(calls[0].opts.method, "GET");
  assert.equal(calls[0].opts.headers["Notion-Version"], NOTION_API_VERSION);
  assert.equal(calls[0].opts.headers.Authorization, "Bearer secret");
});
test("prevents request path injection and invalid page sizes", async () => {
  const client = createNotionReadClient({ token: "secret", request: () => {
    throw new Error("must not be called");
  } });
  await assert.rejects(client.getPage("https://evil.example/"), { code: "INVALID_INPUT" });
  await assert.rejects(client.listBlockChildren(ID, { size: 101 }), { code: "INVALID_INPUT" });
  await assert.rejects(client.searchByTitle({ query: "x".repeat(201) }), { code: "INVALID_INPUT" });
});
test("search is title-only and explicitly bounded", async () => {
  let body;
  const client = createNotionReadClient({ token: "secret", request: async (url, opts) => {
    assert.equal(url, "https://api.notion.com/v1/search");
    body = JSON.parse(opts.body);
    return response(LIST);
  } });
  const list = await client.searchByTitle({ query: " roadmap ", size: 20 });
  assert.equal(body.query, "roadmap");
  assert.equal(body.page_size, 20);
  assert.equal(list.results.length, 1);
});
test("cursor pagination has a strict maximum and signals truncation", async () => {
  let calls = 0;
  const client = createNotionReadClient({ token: "secret", request: async () => {
    calls++;
    return response({ results: [{ id: ID }], has_more: true, next_cursor: "cursor-" + calls });
  } });
  const result = await client.collectSearchByTitle({ maxPages: 2 });
  assert.equal(calls, 2);
  assert.equal(result.items.length, 2);
  assert.equal(result.truncated, true);
  assert.equal(result.nextCursor, "cursor-2");
  await assert.rejects(client.collectSearchByTitle({ maxPages: 11 }), { code: "INVALID_INPUT" });
});
test("maps 401, 403, 404, 429 and provider failures without leaking response bodies", async () => {
  for (const [status, code] of [[401, "AUTH_REQUIRED"], [403, "PERMISSION_DENIED"],
    [404, "NOT_FOUND_OR_HIDDEN"], [429, "RATE_LIMITED"], [503, "PROVIDER_UNAVAILABLE"]]) {
    const headers = new Headers(status === 429 ? { "retry-after": "5" } : {});
    const client = createNotionReadClient({ token: "secret", request: async () =>
      response({ access_token: "DO_NOT_EXPOSE" }, status, headers) });
    await assert.rejects(client.getPage(ID), (error) => {
      assert.equal(error.code, code);
      assert.equal(error.message.includes("DO_NOT_EXPOSE"), false);
      if (status === 429) assert.equal(error.retryAfterSeconds, 5);
      return true;
    });
  }
});
test("malformed responses and aborted requests fail closed", async () => {
  const invalid = createNotionReadClient({ token: "secret", request: async () => response({ results: [], has_more: true }) });
  await assert.rejects(invalid.searchByTitle(), { code: "INVALID_RESPONSE" });
  const abort = new AbortController(); abort.abort();
  const pending = createNotionReadClient({ token: "secret", request: async (_url, opts) => {
    assert.equal(opts.signal.aborted, true);
    throw new Error("network request canceled");
  } });
  await assert.rejects(pending.getPage(ID, { signal: abort.signal }), { code: "REQUEST_TIMEOUT_OR_ABORTED" });
});
test("never accepts a token with a newline", () => {
  assert.throws(() => createNotionReadClient({ token: "abc\nBearer hijack" }), NotionReadError);
});
