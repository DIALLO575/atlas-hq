import type { JournalProgressInput } from "./journal-source.mjs";

export const CACHE_VERSION: 2;
export const SOFT_TTL_MS: number;
export const MAX_CACHE_BYTES: number;
export function journalPayloadEqual(a: unknown, b: unknown): boolean;
export type JournalCacheToken = { scope: string; epoch: string };
export type JournalQueueOperation =
  | { id: string; kind: "state"; body: { workspaceId: string; editionId: string; itemId: string; status: "new" | "read" | "done" }; previousState?: "new" | "read" | "done" }
  | { id: string; kind: "progress"; body: JournalProgressInput };
export type JournalCacheRoot = {
  cacheVersion: number;
  scope: string;
  epoch: string;
  editions: unknown[];
  queue: unknown[];
  preferences: Record<string, unknown>;
};
export type JournalCacheSnapshot = Omit<JournalCacheRoot, "editions" | "queue"> & {
  editions: { cacheVersion: number; key: string; savedAt: number; etag?: string; payload: unknown }[];
  queue: JournalQueueOperation[];
};
export type JournalCacheAdapter = {
  update<T>(transform: (root: JournalCacheRoot | null) => [JournalCacheRoot | null, T]): Promise<T>;
};
export function journalCacheScope(userId: string, workspaceId: string): string;
export function journalCacheKey(userId: string, workspaceId: string, editionId: string): string;
export function cacheIsStale(entry: { savedAt: number } | null | undefined, now: number): boolean;
export function journalPayloadTimestamp(payload: unknown): number;
export function readJournalPreferences(preferences?: Record<string, unknown>): Record<string, string | number> & { hideDone: 0 | 1 };
export function mergeJournalPayload<T extends { items: { key: string }[] }>(previous: T | null | undefined, incoming: T, queue?: JournalQueueOperation[]): T;
export function trimJournalEditions<T extends { cacheVersion: number; savedAt: number; payload?: unknown }>(editions: T[], now: number): T[];
export function safeCachedPayload<T>(payload: T, now: number): T & { offline: true };
export function createJournalCache(adapter: JournalCacheAdapter): {
  open(scope: string): Promise<JournalCacheToken>;
  snapshot(token: JournalCacheToken): Promise<JournalCacheSnapshot | null>;
  save(token: JournalCacheToken, payload: unknown, etag: string | undefined, now: number): Promise<boolean>;
  enqueue(token: JournalCacheToken, operation: { id: string; kind: "state" | "progress"; body: { workspaceId: string; [key: string]: unknown }; previousState?: "new" | "read" | "done" }): Promise<boolean>;
  acknowledge(token: JournalCacheToken, id: string): Promise<unknown>;
  preferences(token: JournalCacheToken, values: Record<string, string | number>): Promise<unknown>;
  purge(): Promise<unknown>;
};
