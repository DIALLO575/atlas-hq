export type MausbotConfig = { readonly baseUrl: string; readonly token: string };
export type MausbotDeps = { fetchImpl?: typeof fetch };
export class MausbotAdapterError extends Error {
  constructor(code: string, status?: number);
  readonly code: string;
  readonly status: number;
}
export function resolveMausbotConfig(env: NodeJS.ProcessEnv, workspaceId: unknown): MausbotConfig | null;
export function mausbotHealth(config: MausbotConfig, deps?: MausbotDeps):
  Promise<{ online: true; engine: "mausbot" }>;
export function mausbotAgents(config: MausbotConfig, deps?: MausbotDeps):
  Promise<Array<{ id: string; name: string; emoji: string | null }>>;
export function mausbotDispatch(config: MausbotConfig, input: {
  botId: unknown; title: unknown; instruction: unknown;
}, deps?: MausbotDeps): Promise<{
  accepted: boolean; taskCreated: true; botId: string; threadId: string;
  sendId: string; error?: string;
}>;
export function mausbotJob(config: MausbotConfig, threadId: unknown, deps?: MausbotDeps): Promise<{
  threadId: string; status: string | null; state: string | null;
  phase: string | null; version: number | null;
}>;

export function mausbotRequest(config: MausbotConfig, path: string, deps?: MausbotDeps & {method?: string; body?: unknown; timeoutMs?: number}): Promise<any>;
