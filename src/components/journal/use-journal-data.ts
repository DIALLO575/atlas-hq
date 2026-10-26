'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { journalCacheStorage, purgeJournalCache } from '@/lib/journal/cache-storage';
import { journalCacheScope, mergeJournalPayload, safeCachedPayload } from '../../../packages/engines/mausbot/src/journal-cache.mjs';
type Item = { id: string; key: string; editionId: string; state: 'new' | 'read' | 'done' };
type Payload = { editionId: string; source: string; items: Item[]; coverExpiresAt?: string; offline?: boolean };
type Operation = { previousState?: Item['state']; id: string; kind: 'state' | 'progress'; body: { workspaceId: string; [key: string]: unknown } };
type Token = { scope: string; epoch: string };
export function useJournalData<T extends Payload>(workspaceId: string, nonce: number) {
  const [view, setView] = useState<{ status: 'loading' | 'ready' | 'error' | 'offline'; data?: T; error?: string }>({ status: 'loading' });
  const [preferences, setPreferences] = useState<Record<string, string | number>>({});
  const [visibleWorkspace, setVisibleWorkspace] = useState('');
  const active = useRef<{ cache: Awaited<ReturnType<typeof journalCacheStorage>>['cache']; token: Token; data?: T; etag?: string; refreshing?: boolean } | null>(null);
  const refresh = useRef<() => Promise<void>>(async () => {});
  useEffect(() => {
    if (!workspaceId) return;
    let alive = true;
    let close: (() => void) | undefined;
    const abort = new AbortController();
    const reset = () => { alive = false; abort.abort(); active.current = null; setView({ status: 'error', error: 'AUTH_REQUIRED' }); };
    const externalPurge = (event: StorageEvent) => { if (event.key === 'atlas.journal.purge' || (event.key === 'atlas.journal.scope' && active.current && event.newValue !== active.current.token.scope)) reset(); };
    window.addEventListener('journal:purged', reset); window.addEventListener('storage', externalPurge);
    let currentUser: string | undefined;
    const supabase = createSupabaseBrowserClient();
    const listener = supabase?.auth.onAuthStateChange((event, session) => { if (event === 'SIGNED_OUT' || (event === 'SIGNED_IN' && currentUser && session?.user.id !== currentUser)) { reset(); void purgeJournalCache(); } });
    const onVisible = () => { if (document.visibilityState === 'visible') void refresh.current(); };
    const onOnline = () => void refresh.current();
    window.addEventListener('focus', onVisible); window.addEventListener('online', onOnline); document.addEventListener('visibilitychange', onVisible);
    const timer = setInterval(onVisible, 60000);
    void (async () => {
      try {
        // Local session identity selects device storage only. Server still authorizes every request.
        const session = await supabase?.auth.getSession(); const userId = session?.data.session?.user.id; currentUser = userId;
        if (!userId || !alive) { if (alive) { await purgeJournalCache(); reset(); } return; }
        const storage = await journalCacheStorage(); close = storage.close;
        const token = await storage.cache.open(journalCacheScope(userId,workspaceId));
        localStorage.setItem('atlas.journal.scope',token.scope);
        sessionStorage.setItem('atlas.journal.offline-capability',JSON.stringify(token));
        if (!alive) { storage.close(); return; }
        const snapshot = await storage.cache.snapshot(token);
        const cached = snapshot?.editions[0];
        if (alive) setPreferences(Object.fromEntries(Object.entries(snapshot?.preferences ?? {}).filter((entry): entry is [string, string | number] => typeof entry[1] === 'string' || typeof entry[1] === 'number')));
        const context = { cache: storage.cache, token, data: cached?.payload as T | undefined, etag: cached?.etag as string | undefined, refreshing: false };
        active.current = context; setVisibleWorkspace(workspaceId); setView({ status: 'loading' });
        if (cached && alive) setView({ status: 'ready', data: safeCachedPayload(cached.payload,Date.now()) as T });
        refresh.current = async () => {
          if (!alive || context.refreshing || !navigator.onLine) return;
          context.refreshing = true;
          try {
            const root = await context.cache.snapshot(token); if (!root || !alive) return;
            for (const operation of root.queue as Operation[]) {
              const response = await fetch('/api/engines/mausbot/journal/' + (operation.kind === 'progress' ? 'progress' : 'state'), { method: 'POST', credentials: 'same-origin', signal: abort.signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(operation.body) });
              if (response.status === 401 || response.status === 403) { await purgeJournalCache(); return; }
              if (!response.ok) {
                if (response.status < 500) {
                  await context.cache.acknowledge(token,operation.id); context.etag = undefined;
                  if (operation.kind === 'state' && context.data) {
                    const remaining = await context.cache.snapshot(token);
                    const rollback = { ...context.data, items: context.data.items.map(i => i.editionId === operation.body.editionId && i.id === operation.body.itemId ? { ...i, state: operation.previousState ?? 'new' } : i) };
                    context.data = mergeJournalPayload(rollback,rollback,remaining?.queue ?? []) as T;
                    if (await context.cache.save(token,context.data,undefined,Date.now()) && alive) setView({ status: 'ready', data: context.data, error: 'JOURNAL_QUEUE_SYNC_FAILED' });
                  }
                }
                throw new Error('JOURNAL_QUEUE_SYNC_FAILED');
              }
              await context.cache.acknowledge(token,operation.id);
            }
            const headers: Record<string,string> = {};
            if (context.etag && (!context.data?.coverExpiresAt || Date.parse(context.data.coverExpiresAt)>Date.now()+60000)) headers['If-None-Match'] = context.etag;
            const response = await fetch('/api/engines/mausbot/journal?workspaceId='+encodeURIComponent(workspaceId), { headers, credentials: 'same-origin', signal: abort.signal, cache: 'no-store' });
            if (response.status === 401 || response.status === 403) { await purgeJournalCache(); return; }
            if (response.status === 304) return; // No body parse and no React data replacement.
            const body = await response.json();
            if (!response.ok) throw new Error(body.error ?? 'JOURNAL_UNAVAILABLE');
            if (body.source !== 'supabase-read-only' || !Array.isArray(body.items)) throw new Error('JOURNAL_PAYLOAD_INVALID');
            const latest = await context.cache.snapshot(token); if (!latest || !alive) return;
            const next = mergeJournalPayload(context.data,body,latest.queue) as T;
            const etag = response.headers.get('etag') ?? undefined;
            if (!await context.cache.save(token,next,etag,Date.now()) || !alive) return;
            context.data = next; context.etag = etag;
            setView({ status: 'ready', data: next });
            window.dispatchEvent(new CustomEvent('journal:updated', { detail: { workspaceId } }));
          } catch (error) {
            if (alive) setView(previous => previous.data ? { ...previous, error: error instanceof Error ? error.message : 'JOURNAL_UNAVAILABLE' } : { status: navigator.onLine ? 'error' : 'offline', error: 'OFFLINE' });
          } finally { context.refreshing = false; }
        };
        await refresh.current();
      } catch { if (alive) setView({ status: 'error', error: 'JOURNAL_CACHE_UNAVAILABLE' }); }
    })();
    return () => { alive = false; abort.abort(); active.current = null; close?.(); listener?.data.subscription.unsubscribe(); clearInterval(timer); window.removeEventListener('focus',onVisible); window.removeEventListener('online',onOnline); document.removeEventListener('visibilitychange',onVisible); window.removeEventListener('journal:purged',reset); window.removeEventListener('storage',externalPurge); };
  }, [workspaceId]);
  useEffect(() => { if (nonce) void refresh.current(); }, [nonce]);
  const enqueue = useCallback(async (operation: Operation) => {
    const context = active.current; if (!context) throw new Error('Journal cache not ready');
    if (operation.kind === 'state') operation = { ...operation, previousState: context.data?.items.find(i => i.editionId === operation.body.editionId && i.id === operation.body.itemId)?.state };
    await context.cache.enqueue(context.token,operation);
    if (operation.kind === 'state' && context.data) {
      const snapshot = await context.cache.snapshot(context.token);
      if (!snapshot) throw new Error('Journal scope changed');
      context.data = mergeJournalPayload(context.data,context.data,snapshot.queue) as T;
      if (!await context.cache.save(context.token,context.data,undefined,Date.now()) || active.current !== context) throw new Error('Journal scope changed');
      context.etag = undefined;
      setView({ status: 'ready', data: context.data });
    }
    void refresh.current();
  }, []);
  const savePreference = useCallback((key: string, value: string | number) => {
    const context = active.current; if (!context) return;
    setPreferences(previous => ({ ...previous, [key]: value }));
    void context.cache.preferences(context.token,{ [key]: value }).catch(() => undefined);
  }, []);
  const scopedView: typeof view = visibleWorkspace === workspaceId ? view : { status: 'loading' };
  return { preferences, savePreference, view: scopedView, setView, enqueue };
}
