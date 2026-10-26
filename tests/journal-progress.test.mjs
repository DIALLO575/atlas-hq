import test from 'node:test';
import assert from 'node:assert/strict';
import { validateJournalProgressInput } from '../packages/engines/mausbot/src/journal-source.mjs';
import { summarizeJournalReading, secondsToMinutes } from '../packages/engines/mausbot/src/journal-reader.mjs';
import { rankItems } from '../packages/engines/mausbot/src/journal-ranking.mjs';
import { recordJournalProgress, readJournalSummary } from '../packages/engines/mausbot/src/journal-progress.mjs';
const event = { editionId: 'edition:1', itemId: 'item.1', deltaSeconds: 30, position: 0.25 };
const body = { workspaceId: '11111111-1111-4111-8111-111111111111', batchId: '22222222-2222-4222-8222-222222222222', events: [event] };
test('strict bounded batch with detached canonical output', () => {
  const result = validateJournalProgressInput(body);
  assert.deepEqual(result, body); assert.notEqual(result.events[0], event);
  for (const deltaSeconds of [0, 120]) assert(validateJournalProgressInput({ ...body, events: [{ ...event, deltaSeconds }] }));
  assert(validateJournalProgressInput({ ...body, events: Array.from({ length: 20 }, (_, i) => ({ ...event, itemId: 'i'+i, deltaSeconds: 6 })) }));
});
test('reject unknown properties, PII, dates, invalid ids, duplicate items and over-budget batch', () => {
  const bad = [null, [], { ...body, userId: 'caller' }, { ...body, workspaceId: 'other' }, { ...body, batchId: '' }, { ...body, events: [] }, { ...body, events: Array(1) }, { ...body, events: [event, event] }];
  for (const patch of [{ deltaSeconds: -1 }, { deltaSeconds: 121 }, { deltaSeconds: 0.5 }, { position: NaN }, { position: 1.1 }, { position: 0.333 }, { itemId: 'https://example.com' }, { itemId: 42 }, { day: '2026-10-25' }, { url: 'secret' }]) bad.push({ ...body, events: [{ ...event, ...patch }] });
  bad.push({ ...body, events: [{ ...event, deltaSeconds: 61 }, { ...event, itemId: 'two', deltaSeconds: 60 }] });
  for (const value of bad) assert.equal(validateJournalProgressInput(value), null);
});
test('aggregates actual seconds, UTC today/seven days, read percent and groups', () => {
  const summary = summarizeJournalReading([{ state: 'done', category: 'ia-sur-x', producer: 'grok-bot' }, { state: 'new', category: 'ia', producer: 'morgans' }],
    [{ day: '2026-10-26', seconds: 30 }, { day: '2026-10-20', seconds: 90 }, { day: '2026-10-19', seconds: 100 }, { day: '2026-10-27', seconds: 50 }], '2026-10-26');
  assert.equal(summary.todayMinutes, 0.5); assert.equal(summary.sevenDayMinutes, 2); assert.equal(summary.percentRead, 50); assert.equal(summary.unread, 1);
  assert.deepEqual(summary.byProducer['grok-bot'], { total: 1, read: 1 }); assert.equal(summary.byCategory['ia-sur-x'].read, 1);
  assert.equal(summarizeJournalReading([], [], '2026-10-26').percentRead, 0); assert.equal(secondsToMinutes(-1), 0);
});
test('ranking preserves editorial order without mutating array', () => {
  const items = [{ id: 2 }, { id: 1 }]; assert.deepEqual(rankItems(items), items); assert.notEqual(rankItems(items), items);
});
test('RPC forwarding is identity-free and handles schema missing/replay conflict', async () => {
  let calls = 0;
  const client = { rpc: async (name, args) => { calls++; assert.equal(name, 'journal_record_progress_batch'); assert.deepEqual(args, { p_workspace: body.workspaceId, p_batch: body.batchId, p_events: [event] }); return { data: { duplicate: true }, error: null }; } };
  assert.equal((await recordJournalProgress(client, {})).status, 400); assert.equal(calls, 0);
  assert.equal((await recordJournalProgress(client, body)).result.duplicate, true);
  for (const [code, expected] of [['PGRST202', 'JOURNAL_PROGRESS_MIGRATION_REQUIRED'], ['22023', 'JOURNAL_PROGRESS_CONFLICT'], ['42501', 'JOURNAL_PROGRESS_UNAVAILABLE']]) {
    assert.equal((await recordJournalProgress({ rpc: async () => ({ error: { code } }) }, body)).code, expected);
  }
});
function summaryClient(missing = false) {
  return { from(table) {
    let producer;
    const chain = { select() { return this; }, eq(key, value) { if (key === 'producer') producer = value; if (key === 'workspace_id') assert.equal(value, body.workspaceId); if (key === 'user_id') assert.equal(value, 'owner'); return this; }, order() { return this; }, limit() { return this; }, in() { return this; }, gte() { return this; }, lte() { return this; },
      async maybeSingle() { return { data: producer === 'morgans' ? { edition_id: 'edition:1', producer } : null }; },
      then(resolve) { const rows = table === 'journal_items' ? [{ edition_id: 'edition:1', item_id: 'item.1', topic: 'ia' }] : table === 'feed_item_state' ? [{ edition_id: 'edition:1', item_id: 'item.1', status: 'read' }] : [{ day: '2026-10-26', seconds: 30 }]; return Promise.resolve(table === 'journal_reading_sessions' && missing ? { error: { code: '42P01' } } : { data: rows }).then(resolve); } };
    return chain;
  } };
}
test('summary service scopes queries, preserves statuses when migration absent', async () => {
  const summary = await readJournalSummary(summaryClient(), body.workspaceId, 'owner', '2026-10-26');
  assert.equal(summary.todayMinutes, 0.5); assert.equal(summary.read, 1); assert.equal(summary.progressAvailable, true);
  const fallback = await readJournalSummary(summaryClient(true), body.workspaceId, 'owner', '2026-10-26');
  assert.equal(fallback.read, 1); assert.equal(fallback.todayMinutes, null); assert.equal(fallback.progressAvailable, false);
});

test('route boundaries require owner before service and restrict query/payload', async () => {
  const { readFileSync } = await import('node:fs');
  const progress = readFileSync(new URL('../src/app/api/engines/mausbot/journal/progress/route.ts', import.meta.url), 'utf8');
  const summary = readFileSync(new URL('../src/app/api/engines/mausbot/journal/summary/route.ts', import.meta.url), 'utf8');
  assert(progress.indexOf('await requireJournalOwner') < progress.indexOf('await recordJournalProgress'));
  assert(summary.indexOf('await requireJournalOwner') < summary.indexOf('await readJournalSummary'));
  assert.match(progress, /8192/); assert.match(summary, /getAll\('workspaceId'\).length !== 1/);
});
