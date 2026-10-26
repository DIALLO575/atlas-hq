import type { createJournalCache } from '../packages/engines/mausbot/src/journal-cache.mjs';
export function journalCacheStorage(): Promise<{cache: ReturnType<typeof createJournalCache>; scope(): Promise<string | null>; close(): void}>;

export function purgeJournalCache(): Promise<void>;
export function cachedJournalWorkspace(userId: string): Promise<string | null>;
