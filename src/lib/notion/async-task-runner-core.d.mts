export function runNotionAsyncTaskWorker(args: {
  admin: unknown;
  vault: unknown;
  onMetric?: (name: string) => void;
  /** Test seam; production uses global fetch and the fixed Notion origin. */
  fetchImpl?: typeof fetch;
}): Promise<Readonly<{ state: "idle" | "succeeded" | "dead" | "rescheduled" }>>;
