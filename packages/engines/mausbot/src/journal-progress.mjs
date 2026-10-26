import { validateJournalProgressInput } from './journal-source.mjs';
export const JOURNAL_READ_THRESHOLD_SECONDS = 30;
export function journalReadThresholdReached(secondsRead, deltaSeconds = 0) {
  return Number.isInteger(secondsRead) && Number.isInteger(deltaSeconds)
    && secondsRead >= 0 && deltaSeconds >= 0
    && secondsRead + deltaSeconds >= JOURNAL_READ_THRESHOLD_SECONDS;
}
export function journalProgressMigrationMissing(error) {
  return ['PGRST202', 'PGRST205', '42P01', '42703', '42883'].includes(error?.code);
}
/** Session client only; caller must first pass requireJournalOwner. No service-role client. */
export async function recordJournalProgress(supabase, body) {
  const input = validateJournalProgressInput(body);
  if (!input) return { ok: false, code: 'JOURNAL_PROGRESS_INVALID', status: 400 };
  const { data, error } = await supabase.rpc('journal_record_progress_batch', {
    p_workspace: input.workspaceId, p_batch: input.batchId, p_events: input.events,
  });
  if (error) return { ok: false, code: journalProgressMigrationMissing(error) ? 'JOURNAL_PROGRESS_MIGRATION_REQUIRED' : error.code === '22023' ? 'JOURNAL_PROGRESS_CONFLICT' : 'JOURNAL_PROGRESS_UNAVAILABLE',
    status: error.code === '22023' ? 409 : 503 };
  return { ok: true, result: data };
}

// Finite edition reads; sessions span seven UTC days, including previous editions.
export async function readJournalSummary(supabase, workspaceId, userId, today = new Date().toISOString().slice(0, 10)) {
  const { summarizeJournalReading } = await import('./journal-reader.mjs');
  const { journalItemKey, normalizeJournalTopic } = await import('./journal.mjs');
  const editions = [];
  for (const producer of ['morgans', 'grok-bot']) {
    const { data, error } = await supabase.from('journal_editions').select('edition_id,producer').eq('workspace_id', workspaceId).eq('producer', producer)
      .order('generated_at', { ascending: false }).limit(1).maybeSingle();
    if (error) throw new Error('JOURNAL_SUMMARY_UNAVAILABLE');
    if (data) editions.push(data);
  }
  const items = [];
  for (const edition of editions) {
    const { data, error } = await supabase.from('journal_items').select('edition_id,item_id,topic').eq('workspace_id', workspaceId).eq('edition_id', edition.edition_id).order('position', { ascending: true }).limit(40);
    if (error) throw new Error('JOURNAL_SUMMARY_UNAVAILABLE');
    for (const row of data ?? []) items.push({ id: row.item_id, editionId: row.edition_id, category: normalizeJournalTopic(row.topic) ?? 'unknown', producer: edition.producer });
  }
  const { data: states, error: stateError } = await supabase.from('feed_item_state').select('edition_id,item_id,status').eq('workspace_id', workspaceId).eq('user_id', userId).in('edition_id', editions.map(e => e.edition_id));
  if (stateError) throw new Error('JOURNAL_SUMMARY_UNAVAILABLE');
  const stateMap = new Map((states ?? []).map(s => [journalItemKey(s.edition_id, s.item_id), s.status]));
  const start = new Date(Date.parse(today + 'T00:00:00Z') - 6 * 86400000).toISOString().slice(0, 10);
  const { data: sessions, error } = await supabase.from('journal_reading_sessions').select('day,seconds').eq('workspace_id', workspaceId).eq('user_id', userId).gte('day', start).lte('day', today).limit(10001);
  if (error && !journalProgressMigrationMissing(error)) throw new Error('JOURNAL_SUMMARY_UNAVAILABLE');
  if ((sessions?.length ?? 0) > 10000) throw new Error('JOURNAL_SUMMARY_LIMIT');
  const summary = summarizeJournalReading(items.map(i => ({ ...i, state: stateMap.get(journalItemKey(i.editionId, i.id)) ?? 'new' })), sessions ?? [], today);
  return { ...summary, today, progressAvailable: !error, ...(error ? { todaySeconds: null, sevenDaySeconds: null, todayMinutes: null, sevenDayMinutes: null, warning: 'JOURNAL_PROGRESS_MIGRATION_REQUIRED' } : {}) };
}
