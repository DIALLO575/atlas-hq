export declare const MAUSBOT_SEND_GUARD_DEFAULTS: Readonly<{ maxActive: number; sameTargetMs: number; crossTargetMs: number; activeRetryMs: number; idempotencyTtlMs: number; maxEntries: number }>;
export declare const MAUSBOT_GUARDED_SEND_PRIMITIVES: readonly string[];
export type MausbotSendDecision =
  | { allowed: true; status: 200; target: string; release(): void }
  | { allowed: false; status: number; code: string; retryAfterSeconds?: number };
export type MausbotSendFleet = { agents: unknown[]; channels?: unknown[] } | null;
export declare function mausbotSendKillSwitchActive(env?: Record<string, string | undefined>): boolean;
export declare function isMausbotBotActive(bot: unknown): boolean;
export declare function mausbotSendTarget(primitive: string, args: unknown, fleet: MausbotSendFleet): { key: string; botIds: string[] } | null;
export interface MausbotSendGuard {
  reserve(input: { env?: Record<string, string | undefined>; primitive: string; args: unknown; fleet: MausbotSendFleet;
    initiator?: { kind: "owner" | "bot" | "automation"; botId?: string }; idempotencyKey?: string | null }): MausbotSendDecision;
  readonly config: Readonly<Record<string, unknown>>;
}
export declare function createMausbotSendGuard(options?: Partial<{ maxActive: number; sameTargetMs: number; crossTargetMs: number; activeRetryMs: number; idempotencyTtlMs: number; maxEntries: number; now: () => number }>): MausbotSendGuard;
export declare function sharedMausbotSendGuard(): MausbotSendGuard;
