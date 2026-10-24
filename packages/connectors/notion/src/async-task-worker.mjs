/**
 * SHA-141: pure read-only Notion async_task status poller.
 * No provider writes or user-supplied HTTP origins, tokens or arbitrary jobs.
 * Concrete server worker must separately validate the current actor binding,
 * decrypt via the service vault, and use the distributed REST budget.
 */
const TASK_ID = /^task_[A-Za-z0-9_-]{1,128}$/;
function pause(seconds) {
  return Number.isInteger(seconds) && seconds >= 1 && seconds <= 3600 ? seconds : 3;
}
export function classifyNotionAsyncTask(task, id) {
  if (!TASK_ID.test(id) || !task || task.object !== "async_task" ||
      task.id !== id || typeof task.status !== "string") {
    return Object.freeze({ outcome: "permanent", delaySeconds: 3,
      errorCode: "invalid_response" });
  }
  if (task.status === "succeeded") {
    return Object.freeze({ outcome: "succeeded", delaySeconds: 3, errorCode: null });
  }
  if (task.status === "failed") {
    return Object.freeze({ outcome: "permanent", delaySeconds: 3,
      errorCode: "provider_failed" });
  }
  if (["queued","running","retrying"].includes(task.status)) {
    return Object.freeze({ outcome: "poll_again",
      delaySeconds: pause(task.poll_after_seconds), errorCode: null });
  }
  return Object.freeze({ outcome: "permanent", delaySeconds: 3,
    errorCode: "invalid_response" });
}
export function classifyNotionAsyncPollError(error) {
  const code = error?.code;
  if (code === "AUTH_REQUIRED") return Object.freeze({
    outcome: "permanent",delaySeconds: 3,errorCode: "auth_required" });
  if (code === "PERMISSION_DENIED") return Object.freeze({
    outcome: "permanent",delaySeconds: 3,errorCode: "permission_denied" });
  if (code === "NOT_FOUND_OR_HIDDEN") return Object.freeze({
    outcome: "permanent",delaySeconds: 3,errorCode: "task_not_found" });
  if (["RATE_LIMITED","PROVIDER_OVERLOADED","PROVIDER_UNAVAILABLE",
    "REQUEST_TIMEOUT_OR_ABORTED"].includes(code)) return Object.freeze({
      outcome: "transient", delaySeconds: pause(error?.retryAfterSeconds),
      errorCode: "provider_transient" });
  return Object.freeze({ outcome: "permanent",delaySeconds: 3,
    errorCode: "invalid_response" });
}
/**
 * Caller supplies an authenticated, credential-version-bound reader. It is
 * deliberately NOT a runnable public API endpoint or background schedule.
 */
export async function processOneNotionAsyncTask({ store, readTask }) {
  if (!store || typeof store.claim !== "function" ||
      typeof store.finish !== "function" || typeof readTask !== "function") {
    throw new Error("INVALID_ASYNC_WORKER");
  }
  const claim = await store.claim();
  if (!claim) return Object.freeze({ state: "idle" });
  if (!claim.job_id || !claim.lease_id ||
      !TASK_ID.test(claim.provider_task_id ?? "")) {
    throw new Error("INVALID_ASYNC_LEASE");
  }
  let result;
  try { result = classifyNotionAsyncTask(await readTask(claim),claim.provider_task_id); }
  catch (error) { result = classifyNotionAsyncPollError(error); }
  const saved = await store.finish({
    jobId: claim.job_id, leaseId: claim.lease_id,
    outcome: result.outcome, delaySeconds: result.delaySeconds,
    errorCode: result.errorCode,
  });
  if (saved !== true) throw new Error("ASYNC_LEASE_LOST");
  return Object.freeze({
    state: result.outcome === "succeeded" ? "succeeded" :
      result.outcome === "permanent" ? "dead" : "rescheduled",
  });
}
