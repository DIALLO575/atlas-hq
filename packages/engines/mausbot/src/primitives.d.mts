import type { MausbotConfig, MausbotDeps } from "./adapter.mjs";
export function executeMausbotPrimitive(config: MausbotConfig, primitiveId: string,
  input?: Record<string,unknown>, deps?: MausbotDeps): Promise<Record<string,any>>;
