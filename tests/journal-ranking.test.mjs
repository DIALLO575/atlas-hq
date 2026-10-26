import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { rankEditions, rankItems } from '../packages/engines/mausbot/src/journal-ranking.mjs';

const editions = [
  { editionId: 'morgans', producer: 'morgans', generatedAt: '2026-10-26T00:10:00Z' },
  { editionId: 'grok', producer: 'grok-bot', generatedAt: '2026-10-26T06:55:00Z', receivedAt: '2026-10-26T07:00:00Z' },
];

test('unread first, then started and read items, with done items at the bottom across editions', () => {
  const items = [
    { id: 'done-old', editionId: 'morgans', state: 'done', position: 0 },
    { id: 'read-old', editionId: 'morgans', state: 'read', lastPosition: 0, position: 0 },
    { id: 'started-new', editionId: 'grok', state: 'read', lastPosition: 0.25, position: 2 },
    { id: 'new-old', editionId: 'morgans', state: 'new', position: 0 },
    { id: 'new-grok-late', editionId: 'grok', state: 'new', position: 5 },
    { id: 'new-grok-first', editionId: 'grok', state: 'new', position: 1 },
    { id: 'done-new', editionId: 'grok', state: 'done', position: 0 },
  ];
  const ranked = rankItems(items, editions);
  assert.deepEqual(ranked.map(item => item.id), [
    'new-grok-first', 'new-grok-late', 'new-old', 'started-new', 'read-old', 'done-new', 'done-old',
  ]);
  assert.ok(ranked.slice(0, 5).every(item => item.state !== 'done'));
  assert.ok(ranked.slice(-2).every(item => item.state === 'done'));
});

test('received_at breaks a missing generated_at and newest producer is first', () => {
  assert.deepEqual(rankEditions([
    { editionId: 'morgans', generatedAt: '2026-10-26T01:00:00Z' },
    { editionId: 'grok', generatedAt: null, receivedAt: '2026-10-26T02:00:00Z' },
  ]).map(item => item.editionId), ['grok', 'morgans']);
});

test('edition ordering around UTC/PDT midnight is identical in UTC and Los Angeles', () => {
  const script = `
    import { rankItems } from ${JSON.stringify(new URL('../packages/engines/mausbot/src/journal-ranking.mjs', import.meta.url).href)};
    const editions = [
      { editionId: 'utc-midnight', generatedAt: '2026-10-26T00:10:00Z' },
      { editionId: 'pdt-midnight', generatedAt: '2026-10-25T23:55:00-07:00' }
    ];
    const items = editions.map((edition, index) => ({ id: String(index), editionId: edition.editionId, state: 'new', position: 0 }));
    console.log(JSON.stringify(rankItems(items, editions).map(item => item.editionId)));
  `;
  const order = timezone => execFileSync(process.execPath, ['--input-type=module', '-e', script], {
    encoding: 'utf8', env: { ...process.env, TZ: timezone },
  }).trim();
  assert.equal(order('America/Los_Angeles'), order('UTC'));
  assert.deepEqual(JSON.parse(order('UTC')), ['pdt-midnight', 'utc-midnight']);
});
