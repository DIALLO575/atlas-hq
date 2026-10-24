/**
 * SHA-141 — bounded, best-effort process-local Notion REST budgets.
 *
 * A shared Notion workspace limit applies across its connections. This gate
 * enforces conservative spacing in ONE Node.js worker only. It is not a
 * distributed quota/queue or an authorization decision.
 *
 * Never use tokens, titles or resource content as scheduling keys.
 */
const UUID = /^(?:[a-f0-9]{32}|[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})$/i;
const normalize = id => typeof id === "string" && UUID.test(id) ? id.toLowerCase().replaceAll("-", "") : null;
export class NotionBudgetError extends Error {
  constructor(code, retryAfterSeconds = null) {
    super(code);
    this.name = "NotionBudgetError";
    this.code = code;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}
export function waitForNotionBudget(ms, signal) {
  if (signal?.aborted) return Promise.reject(new NotionBudgetError("REQUEST_ABORTED"));
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    let timer;
    const abort = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      reject(new NotionBudgetError("REQUEST_ABORTED"));
    };
    timer = setTimeout(() => {
      signal?.removeEventListener("abort", abort);
      resolve();
    }, ms);
    signal?.addEventListener?.("abort", abort, { once: true });
  });
}
export function createNotionRestBudget({
  intervalMs = 350, maxWaitMs = 3000, maxPending = 32,
  maxKeys = 512, now = Date.now, wait = waitForNotionBudget,
} = {}) {
  if (![intervalMs, maxWaitMs, maxPending, maxKeys].every(Number.isSafeInteger) ||
      intervalMs < 1 || intervalMs > 1000 || maxWaitMs < 1 ||
      maxWaitMs > 30_000 || maxPending < 1 || maxPending > 256 ||
      maxKeys < 1 || maxKeys > 10000 ||
      typeof now !== "function" || typeof wait !== "function") {
    throw new NotionBudgetError("INVALID_BUDGET_CONFIG");
  }
  const connections = new Map();
  const workspaces = new Map();
  function state(map, key, time) {
    let item = map.get(key);
    if (item) return item;
    if (map.size >= maxKeys) {
      for (const [id, value] of map) {
        if (value.pending === 0 && value.nextAt < time - 60_000 &&
            value.cooldownUntil < time) map.delete(id);
      }
    }
    if (map.size >= maxKeys) throw new NotionBudgetError("BUDGET_CAPACITY", 1);
    item = { nextAt: 0, cooldownUntil: 0, pending: 0 };
    map.set(key, item);
    return item;
  }
  function keys(scope) {
    const workspace = normalize(scope?.workspaceId);
    const connection = normalize(scope?.connectionId);
    if (!workspace || !connection) throw new NotionBudgetError("INVALID_BUDGET_SCOPE");
    return { workspace, connection };
  }
  function beforeRequest(scope, signal) {
    const { workspace, connection } = keys(scope);
    if (signal?.aborted) return Promise.reject(new NotionBudgetError("REQUEST_ABORTED"));
    const timestamp = now();
    const w = state(workspaces, workspace, timestamp);
    const c = state(connections, connection, timestamp);
    if (w.pending >= maxPending || c.pending >= maxPending) {
      return Promise.reject(new NotionBudgetError("BUDGET_CAPACITY", 1));
    }
    const due = Math.max(timestamp, w.nextAt, c.nextAt,
      w.cooldownUntil, c.cooldownUntil);
    const delay = Math.max(0, due - timestamp);
    if (delay > maxWaitMs) {
      return Promise.reject(new NotionBudgetError(
        "BUDGET_DEFERRED", Math.max(1, Math.ceil(delay / 1000)),
      ));
    }
    w.nextAt = due + intervalMs;
    c.nextAt = due + intervalMs;
    w.pending += 1;
    c.pending += 1;
    return Promise.resolve().then(() => wait(delay, signal)).finally(() => {
      w.pending -= 1;
      c.pending -= 1;
    });
  }
  function observeRateLimit(scope, retryAfterSeconds) {
    const { workspace, connection } = keys(scope);
    const timestamp = now();
    const w = state(workspaces, workspace, timestamp);
    const c = state(connections, connection, timestamp);
    const delay = retryAfterSeconds == null ? 1000
      : Math.min(3_600_000, Math.max(0, retryAfterSeconds * 1000));
    // Conservative workspace-wide cooldown, even if provider-specific
    // error reason was per connection; shared cross-process quota is unknown.
    w.cooldownUntil = Math.max(w.cooldownUntil, timestamp + delay);
    c.cooldownUntil = Math.max(c.cooldownUntil, timestamp + delay);
  }
  return Object.freeze({ beforeRequest, observeRateLimit });
}

// Module-level singleton shared by clients inside this Node process.
// Other serverless instances have independent schedules; a durable distributed
// queue/circuit breaker is a separate SHA-141 follow-up.
const shared = createNotionRestBudget();
export function notionRestBudgetForPersonalConnection({ workspaceId, connectionId }) {
  const scope = { workspaceId, connectionId };
  keysForScope(scope);
  return Object.freeze({
    beforeRequest(signal) { return shared.beforeRequest(scope, signal); },
    observeRateLimit(seconds) { return shared.observeRateLimit(scope, seconds); },
  });
}
function keysForScope(scope) {
  if (!normalize(scope?.workspaceId) || !normalize(scope?.connectionId)) {
    throw new NotionBudgetError("INVALID_BUDGET_SCOPE");
  }
}
