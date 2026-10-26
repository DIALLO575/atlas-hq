export const AGENT_POLL_ACTIVE_MS: 2000;
export const AGENT_POLL_IDLE_MS: 15000;
export function createAgentPollScheduler(options: {
  load: (signal: AbortSignal) => Promise<unknown>;
  isActive: () => boolean;
  onError?: (error: unknown) => void;
  visibility?: Pick<Document, "visibilityState" | "hidden" | "addEventListener" | "removeEventListener">;
  setTimer?: typeof setTimeout;
  clearTimer?: typeof clearTimeout;
  now?: () => number;
}): { start(): void; stop(): void };
