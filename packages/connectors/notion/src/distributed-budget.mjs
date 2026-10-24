import { NotionBudgetError, waitForNotionBudget } from "./reliability.mjs";

/**
 * SHA-141 distributed, opt-in, read-only admission. The PostgreSQL RPC must
 * authenticate actor/workspace/credential VERSION on every reservation.
 * Each call is admitted across all Node workers, not just this process.
 *
 * A reservation is a short time-slot, NOT a lease that holds a transaction
 * across the network request. Aborted waits waste a slot (safe fail-closed).
 */
const UUID = /^(?:[a-f0-9]{32}|[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})$/i;
function valid(binding) {
  return binding && typeof binding === "object" &&
    ["workspaceId","userId","connectionId","notionWorkspaceId"]
      .every(key => typeof binding[key] === "string" && UUID.test(binding[key])) &&
    Number.isSafeInteger(binding.version) && binding.version > 0;
}
export function createNotionDistributedBudget({
  binding, store, localBudget, wait = waitForNotionBudget, maxWaitMs = 3000,
}) {
  if (!valid(binding) || !store || typeof store.reserve !== "function" ||
      typeof store.cooldown !== "function" ||
      typeof store.reportOutcome !== "function" ||
      !localBudget || typeof localBudget.beforeRequest !== "function" ||
      typeof localBudget.observeRateLimit !== "function" ||
      typeof wait !== "function" ||
      !Number.isInteger(maxWaitMs) || maxWaitMs < 0 || maxWaitMs > 3000) {
    throw new NotionBudgetError("INVALID_BUDGET_CONFIG");
  }
  const key = Object.freeze({
    workspaceId: binding.workspaceId, userId: binding.userId,
    notionWorkspaceId: binding.notionWorkspaceId,
    connectionId: binding.connectionId, version: binding.version,
  });
  return Object.freeze({
    async beforeRequest(signal) {
      if (signal?.aborted) throw new NotionBudgetError("REQUEST_ABORTED");
      await localBudget.beforeRequest(signal);
      let reservation;
      try { reservation = await store.reserve({ ...key, maxWaitMs }); }
      catch { throw new NotionBudgetError("BUDGET_UNAVAILABLE"); }
      const ms = reservation?.delayMs;
      const probeLeaseId = reservation?.probeLeaseId ?? null;
      if (signal?.aborted) throw new NotionBudgetError("REQUEST_ABORTED");
      if (!Number.isInteger(ms) || (probeLeaseId !== null &&
          (typeof probeLeaseId !== "string" || !UUID.test(probeLeaseId)))) {
        throw new NotionBudgetError("BUDGET_UNAVAILABLE");
      }
      if (ms < 0) {
        throw new NotionBudgetError("BUDGET_DEFERRED", -ms);
      }
      if (ms > maxWaitMs) throw new NotionBudgetError("BUDGET_UNAVAILABLE");
      await wait(ms, signal);
      return Object.freeze({ probeLeaseId });
    },
    async observeRateLimit(seconds) {
      // Keep local cooldown even if a distributed DB call is unavailable.
      localBudget.observeRateLimit(seconds);
      try {
        const saved = await store.cooldown({ ...key, seconds });
        if (saved !== true) throw new Error("NOTION_BUDGET_DENIED");
      } catch {
        // Do not retry a 429/529 if the cooldown could not be shared.
        throw new NotionBudgetError("BUDGET_UNAVAILABLE");
      }
    },
    async observeOutcome(outcome, reservation = null) {
      if (!["success","transient"].includes(outcome)) {
        throw new NotionBudgetError("INVALID_BUDGET_OUTCOME");
      }
      try {
        const probeLeaseId = reservation?.probeLeaseId ?? null;
        if (probeLeaseId !== null && (typeof probeLeaseId !== "string" ||
            !UUID.test(probeLeaseId))) throw new Error("INVALID_PROBE_LEASE");
        if (await store.reportOutcome({ ...key, outcome, probeLeaseId }) !== true) {
          throw new Error("NOTION_BUDGET_OUTCOME_REJECTED");
        }
      } catch {
        // Do not optimistic-retry when circuit sharing is unavailable.
        throw new NotionBudgetError("BUDGET_UNAVAILABLE");
      }
    },
  });
}
