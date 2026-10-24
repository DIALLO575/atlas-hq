import "server-only";
import { runNotionAsyncTaskWorker } from "./async-task-runner-core.mjs";
import { adminNotionClient, notionConnectSettings, notionTokenVault } from "./connect";

/**
 * One-shot, manually invoked server runner. No route, schedule, or automatic
 * activation is installed here. Both release flags must be explicitly enabled.
 */
export async function runOneNotionAsyncTask(onMetric: (name: string) => void = () => {}) {
  if (process.env.NOTION_ASYNC_TASK_WORKER_ENABLED !== "true" ||
      process.env.NOTION_DISTRIBUTED_BUDGET_ENABLED !== "true") {
    return Object.freeze({ state: "disabled" as const });
  }
  const settings = notionConnectSettings();
  const vault = notionTokenVault();
  if (!settings?.callbackEnabled || !vault) throw new Error("NOTION_WORKER_NOT_CONFIGURED");
  const admin = adminNotionClient(settings);
  return runNotionAsyncTaskWorker({ admin, vault, onMetric });
}
