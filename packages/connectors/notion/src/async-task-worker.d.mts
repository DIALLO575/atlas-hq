export type NotionAsyncResult = Readonly<{
  outcome: "succeeded" | "poll_again" | "transient" | "permanent";
  delaySeconds: number;
  errorCode: string | null;
}>;
export function classifyNotionAsyncTask(task: unknown, expectedTaskId: string): NotionAsyncResult;
export function classifyNotionAsyncPollError(error: unknown): NotionAsyncResult;
export function processOneNotionAsyncTask(args: {
  store: {
    claim(): Promise<null | { job_id: string; lease_id: string; connection_id: string;
      workspace_id: string; user_id: string; notion_workspace_id: string;
      credential_version: number; provider_task_id: string }>;
    finish(value: { jobId: string; leaseId: string;
      outcome: NotionAsyncResult["outcome"];
      delaySeconds: number; errorCode: string | null }): Promise<boolean>;
  };
  readTask(claim: {job_id: string; lease_id: string; connection_id: string;
    workspace_id: string; user_id: string; notion_workspace_id: string;
    credential_version: number; provider_task_id: string}, options: {signal: AbortSignal}):
    Promise<unknown>;
  onMetric?(name: "idle" | "invalid_lease" | "lease_lost" | "store_unavailable" |
    "succeeded" | "dead" | "rescheduled"): void;
}): Promise<Readonly<{state: "idle" | "succeeded" | "dead" | "rescheduled"}>>;
