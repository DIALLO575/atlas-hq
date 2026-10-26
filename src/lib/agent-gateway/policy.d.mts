export const ENTITIES: readonly string[];
export const UUID: RegExp;
export const PAGE_KEY: RegExp;
export const AGENT_KEY: RegExp;
export function validContext(context: unknown): boolean;
export function assertEntityScope(storedEntity: unknown, requestedEntity: unknown, otherBindings?: unknown[]): boolean;
export function replayReceipt(receipt: { body_digest: string; state: string; thread_id: string } | null,
  digest: string): null | { conflict: true; code: string } | { duplicate: true; accepted: boolean; threadId: string };
export function publicMessage(message: unknown, secret?: string): { id: string; role: string; at: string | null; text: string } | null;
