export type NotionAsyncResult = Readonly<{
  outcome: "succeeded" | "poll_again" | "transient" | "permanent";
  delaySeconds: number;
  errorCode: string | null;
}>;
export function classifyNotionAsyncTask(task: unknown, expectedTaskId: string): NotionAsyncResult;
export function classifyNotionAsyncPollError(error: unknown): NotionAsyncResult;
export function processOneNotionAsyncTask(args: {
  store: {
    claim(): Promise<null | { job_id: string; lease_id: string; provider_task_id: string }>;
    finish(value: { jobId: string; leaseId: string;
      outcome: NotionAsyncResult["outcome"];
      delaySeconds: number; errorCode: string | null }): Promise<boolean>;
  };
  readTask(claim: {job_id: string; lease_id: string; provider_task_id: string}):
    Promise<unknown>;
}): Promise<Readonly<{state: "idle" | "succeeded" | "dead" | "rescheduled"}>>;
