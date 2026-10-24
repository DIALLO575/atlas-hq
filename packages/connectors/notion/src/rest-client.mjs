import { NotionBudgetError, waitForNotionBudget } from "./reliability.mjs";
/**
 * ATLAS Notion REST adapter — server-side, read-only V1.
 * Does not grant access: caller must obtain a verified provider token
 * and enforce ATLAS actor/workspace ownership before constructing the client.
 */
export const NOTION_API_VERSION = "2026-03-11";
const ORIGIN = "https://api.notion.com";
const UUID = /^(?:[0-9a-f]{32}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

export class NotionReadError extends Error {
  constructor(code, status = null, retryAfterSeconds = null) {
    super(code);
    this.name = "NotionReadError";
    this.code = code;
    this.status = status;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}
function uuid(value) {
  if (typeof value !== "string" || !UUID.test(value)) {
    throw new NotionReadError("INVALID_INPUT", 400);
  }
  return value;
}
function cursor(value) {
  if (value == null) return null;
  if (typeof value !== "string" || !value || value.length > 2048) {
    throw new NotionReadError("INVALID_INPUT", 400);
  }
  return value;
}
function pageSize(value) {
  if (!Number.isInteger(value) || value < 1 || value > 100) {
    throw new NotionReadError("INVALID_INPUT", 400);
  }
  return value;
}
function retryAfter(headers) {
  const raw = headers?.get?.("retry-after");
  if (!raw || !/^\d{1,5}$/.test(raw)) return null;
  return Math.min(Number(raw), 3600);
}
function errorForStatus(status, headers) {
  const code = status === 401 ? "AUTH_REQUIRED"
    : status === 403 ? "PERMISSION_DENIED"
    : status === 404 ? "NOT_FOUND_OR_HIDDEN"
    : status === 429 ? "RATE_LIMITED"
    : status === 529 ? "PROVIDER_OVERLOADED"
    : status === 400 ? "INVALID_REQUEST"
    : status >= 500 ? "PROVIDER_UNAVAILABLE" : "NOTION_REJECTED";
  return new NotionReadError(code, status, retryAfter(headers));
}
function requireObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new NotionReadError("INVALID_RESPONSE", 502);
  }
  return value;
}
function paginated(value) {
  const result = requireObject(value);
  if (!Array.isArray(result.results) || typeof result.has_more !== "boolean" ||
      (result.has_more && (typeof result.next_cursor !== "string" || !result.next_cursor))) {
    throw new NotionReadError("INVALID_RESPONSE", 502);
  }
  return result;
}

/**
 * No caller-controlled origin, path or HTTP verb. POST is used only for
 * documented read-only search/data-source query endpoints.
 */
export function createNotionReadClient({
  token, request = fetch, timeoutMs = 10000, requestBudget = null,
  retryOptions = {},
}) {
  if (typeof token !== "string" || !token || token.length > 16384 || /[\r\n]/.test(token)) {
    throw new NotionReadError("AUTH_REQUIRED", 401);
  }
  if (typeof request !== "function" || !Number.isInteger(timeoutMs) ||
      timeoutMs < 100 || timeoutMs > 30000) {
    throw new NotionReadError("INVALID_INPUT", 400);
  }
  const { maxRetries = 2, maxAutoWaitMs = 2500,
    wait = waitForNotionBudget, random = Math.random } = retryOptions;
  if (!Number.isInteger(maxRetries) || maxRetries < 0 || maxRetries > 3 ||
      !Number.isInteger(maxAutoWaitMs) || maxAutoWaitMs < 100 ||
      maxAutoWaitMs > 5000 || typeof wait !== "function" ||
      typeof random !== "function" ||
      (requestBudget !== null && (typeof requestBudget.beforeRequest !== "function" ||
        typeof requestBudget.observeRateLimit !== "function"))) {
    throw new NotionReadError("INVALID_INPUT", 400);
  }
  async function call(method, path, body, signal) {
    // Only our fixed, read-only endpoint list reaches this function. GET 5xx
    // can be safely retried; POST /search may retry 429/529 but not ambiguous
    // 5xx or network errors. No generic mutation retry is implemented.
    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      const controller = new AbortController();
      const cancel = () => controller.abort();
      if (signal?.aborted) cancel();
      else signal?.addEventListener?.("abort", cancel, { once: true });
      const timeout = setTimeout(cancel, timeoutMs);
      let response;
      try {
        if (requestBudget) {
          try { await requestBudget.beforeRequest(controller.signal); }
          catch (error) {
            if (error instanceof NotionBudgetError) {
              throw new NotionReadError(error.code === "REQUEST_ABORTED"
                ? "REQUEST_TIMEOUT_OR_ABORTED" : "RATE_LIMITED",
              error.code === "REQUEST_ABORTED" ? null : 429,
              error.retryAfterSeconds);
            }
            throw new NotionReadError("PROVIDER_UNAVAILABLE");
          }
        }
        response = await request(ORIGIN + path, {
          method,
          headers: {
            Authorization: "Bearer " + token,
            "Notion-Version": NOTION_API_VERSION,
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          ...(body == null ? {} : { body: JSON.stringify(body) }),
          signal: controller.signal,
          cache: "no-store",
          redirect: "error",
        });
      } catch (error) {
        if (error instanceof NotionReadError) throw error;
        // Network/timeout outcome may be ambiguous: never silently replay.
        throw new NotionReadError(controller.signal.aborted
          ? "REQUEST_TIMEOUT_OR_ABORTED" : "PROVIDER_UNAVAILABLE");
      } finally {
        clearTimeout(timeout);
        signal?.removeEventListener?.("abort", cancel);
      }
      if (!response || typeof response.status !== "number" ||
          typeof response.ok !== "boolean") {
        throw new NotionReadError("INVALID_RESPONSE", 502);
      }
      if (!response.ok) {
        const status = response.status;
        const seconds = retryAfter(response.headers);
        if ((status === 429 || status === 529) && requestBudget) {
          requestBudget.observeRateLimit(seconds);
        }
        const safeRetry = (status === 429 || status === 529 ||
          (method === "GET" && [500, 502, 503, 504].includes(status)));
        const jitter = Math.min(200, Math.floor(Math.max(0,
          Math.min(1, Number(random()) || 0)) * 200));
        const fallbackMs = Math.min(4000, 1000 * (2 ** attempt));
        const delayMs = seconds !== null && (status === 429 || status === 529)
          ? seconds * 1000 + jitter : fallbackMs + jitter;
        // If Retry-After is larger than our serverless wait budget, return
        // the error with the original header value; do not ignore cooldown.
        if (!safeRetry || attempt >= maxRetries ||
            delayMs > maxAutoWaitMs || signal?.aborted) {
          throw errorForStatus(status, response.headers);
        }
        try {
          await response.body?.cancel?.();
          await wait(delayMs, signal);
        } catch {
          throw new NotionReadError("REQUEST_TIMEOUT_OR_ABORTED");
        }
        continue;
      }
      try {
        return requireObject(await response.json());
      } catch {
        throw new NotionReadError("INVALID_RESPONSE", 502);
      }
    }
    throw new NotionReadError("PROVIDER_UNAVAILABLE", 503);
  }
  function parameters({ startCursor = null, size = 50 } = {}) {
    const search = new URLSearchParams({ page_size: String(pageSize(size)) });
    if (cursor(startCursor)) search.set("start_cursor", startCursor);
    return search;
  }
  return Object.freeze({
    /** Notion search is by TITLE, not full-text. */
    async searchByTitle({ query = "", startCursor = null, size = 50, signal } = {}) {
      if (typeof query !== "string" || query.length > 200) {
        throw new NotionReadError("INVALID_INPUT", 400);
      }
      const body = { page_size: pageSize(size) };
      if (query.trim()) body.query = query.trim();
      if (cursor(startCursor)) body.start_cursor = startCursor;
      return paginated(await call("POST", "/v1/search", body, signal));
    },
    async getPage(id, { signal } = {}) {
      return call("GET", "/v1/pages/" + uuid(id), null, signal);
    },
    async getDatabase(id, { signal } = {}) {
      return call("GET", "/v1/databases/" + uuid(id), null, signal);
    },
    async getDataSource(id, { signal } = {}) {
      return call("GET", "/v1/data_sources/" + uuid(id), null, signal);
    },
    async listBlockChildren(id, { startCursor = null, size = 50, signal } = {}) {
      return paginated(await call("GET", "/v1/blocks/" + uuid(id) +
        "/children?" + parameters({ startCursor, size }), null, signal));
    },
    async getBlock(id, { signal } = {}) {
      return call("GET", "/v1/blocks/" + uuid(id), null, signal);
    },
    async getCurrentBot({ signal } = {}) {
      return call("GET", "/v1/users/me", null, signal);
    },
    async getAsyncTask(taskId, { signal } = {}) {
      if (typeof taskId !== "string" || !/^task_[a-zA-Z0-9_-]{1,128}$/.test(taskId)) {
        throw new NotionReadError("INVALID_INPUT", 400);
      }
      return call("GET", "/v1/async_tasks/" + taskId, null, signal);
    },
    /** Explicit limit so a single request cannot traverse an entire workspace. */
    async collectSearchByTitle({ query = "", size = 50, maxPages = 3, signal } = {}) {
      if (!Number.isInteger(maxPages) || maxPages < 1 || maxPages > 10) {
        throw new NotionReadError("INVALID_INPUT", 400);
      }
      const items = [];
      let nextCursor = null;
      let hasMore = false;
      for (let page = 0; page < maxPages; page += 1) {
        const result = await this.searchByTitle({ query, size, startCursor: nextCursor, signal });
        items.push(...result.results);
        hasMore = result.has_more;
        nextCursor = result.next_cursor ?? null;
        if (!hasMore) break;
      }
      return { items, hasMore, nextCursor, truncated: hasMore };
    },
  });
}
