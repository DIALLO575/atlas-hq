import test from "node:test";
import assert from "node:assert/strict";
import {
  createNotionRestBudget, NotionBudgetError,
  notionRestBudgetForPersonalConnection, waitForNotionBudget,
} from "../src/reliability.mjs";
const scope = {
  workspaceId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  connectionId: "11111111-1111-4111-8111-111111111111",
};
test("workspace and connection gates serialize simultaneous requests", async () => {
  let clock = 1000;
  const delays = [];
  const budget = createNotionRestBudget({
    intervalMs: 350, now: () => clock,
    wait: async ms => { delays.push(ms); },
  });
  await Promise.all([
    budget.beforeRequest(scope),
    budget.beforeRequest({ ...scope, connectionId:
      "22222222-2222-4222-8222-222222222222" }),
    budget.beforeRequest(scope),
  ]);
  assert.deepEqual(delays, [0,350,700]);
  clock = 2000;
  await budget.beforeRequest(scope);
  assert.equal(delays.at(-1), 50);
});
test("429 cooldown is shared across connections within same Notion workspace", async () => {
  let time = 1000;
  const delays = [];
  const budget = createNotionRestBudget({
    intervalMs: 350, maxWaitMs: 3000, now: () => time,
    wait: async ms => { delays.push(ms); },
  });
  budget.observeRateLimit(scope, 2);
  await budget.beforeRequest({ ...scope, connectionId:
    "33333333-3333-4333-8333-333333333333" });
  assert.equal(delays[0], 2000);
  // A later workspace-wide overload pushes a second request beyond the
  // serverless wait ceiling; no second provider request may be sent.
  time = 1200;
  budget.observeRateLimit(scope, 10);
  await assert.rejects(budget.beforeRequest(scope), {
    code: "BUDGET_DEFERRED",
  });
});
test("oversized Retry-After fails quickly instead of sleeping in serverless worker", async () => {
  const budget = createNotionRestBudget({ maxWaitMs: 100 });
  budget.observeRateLimit(scope, 3600);
  await assert.rejects(budget.beforeRequest(scope), error =>
    error instanceof NotionBudgetError && error.code === "BUDGET_DEFERRED" &&
    error.retryAfterSeconds >= 3599);
});
test("aborted queue waits are cancelled and do not reserve extra pending slots", async () => {
  const controller = new AbortController();
  const budget = createNotionRestBudget({
    intervalMs: 1, maxPending: 1,
    wait: (_ms, signal) => waitForNotionBudget(1000, signal),
  });
  const pending = budget.beforeRequest(scope, controller.signal);
  await assert.rejects(budget.beforeRequest(scope), {
    code: "BUDGET_CAPACITY",
  });
  controller.abort();
  await assert.rejects(pending, { code: "REQUEST_ABORTED" });
  await budget.beforeRequest({ ...scope, connectionId:
    "44444444-4444-4444-8444-444444444444" });
});
test("invalid or token-like scheduling scopes fail closed", async () => {
  assert.throws(() => notionRestBudgetForPersonalConnection({
    ...scope, workspaceId: "Bearer secret",
  }), { code: "INVALID_BUDGET_SCOPE" });
  const budget = createNotionRestBudget();
  assert.throws(() => budget.beforeRequest({
    ...scope, connectionId: "evil-provider-id",
  }), { code: "INVALID_BUDGET_SCOPE" });
});
