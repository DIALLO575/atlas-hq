import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { BASE_COMPOSITION, CATALOG, createBuilder, parseComposition } from '../src/lib/ui-studio/builder.ts';
import { mausbotReleasePermission } from '../packages/engine-core/src/release-gates.mjs';
const proposed = { ...BASE_COMPOSITION, blocks: [
  { id: 'heading', component: 'PageHeading', props: { eyebrow: 'ATLAS', title: 'Missions à préparer', description: 'Préparez vos prochaines missions.' } },
  { id: 'demo', component: 'DemoNotice', props: {} },
] };
test('CLI boundary: catalog, compose, remove, rollback; no source edits', () => {
  const before = readFileSync(new URL('../src/app/ui-studio/page.tsx', import.meta.url), 'utf8');
  const calls = [{ operation: 'catalog' },
    { operation: 'compose', expectedVersion: 0, composition: proposed },
    { operation: 'compose', expectedVersion: 1, composition: BASE_COMPOSITION },
    { operation: 'restore', expectedVersion: 2, version: 1 }];
  const run = spawnSync(process.execPath, ['scripts/ui-builder.mjs'], { encoding: 'utf8', input: calls.map(JSON.stringify).join('\n') + '\n' });
  assert.equal(run.status, 0, run.stderr);
  const output = run.stdout.trim().split('\n').map(JSON.parse);
  assert(output.every((row) => row.ok));
  assert.equal(output[0].result.catalog.components[0].name, 'PageHeading');
  assert.equal(output[1].result.diff.added[0].component, 'DemoNotice');
  assert.equal(output[1].result.diff.changed[0].props.title, 'Missions à préparer');
  assert.equal(output[2].result.diff.removed[0].id, 'demo');
  assert.deepEqual(output[3].result.composition, proposed);
  const preview = new URL(output[3].result.previewPath, 'https://preview.invalid');
  assert.deepEqual(parseComposition(JSON.parse(preview.searchParams.get('composition'))), proposed);
  assert.equal(readFileSync(new URL('../src/app/ui-studio/page.tsx', import.meta.url), 'utf8'), before);
});
test('reject arbitrary fields, bindings, code components, pages and duplicate ids', () => {
  for (const value of [{ ...proposed, workspaceId: 'other' }, { ...proposed, page: 'chief' }, { ...proposed, schemaVersion: 2 },
    { ...proposed, blocks: [{ ...proposed.blocks[0], component: 'script' }] },
    { ...proposed, blocks: [{ ...proposed.blocks[0], props: { ...proposed.blocks[0].props, onClick: 'run()' } }] },
    { ...proposed, blocks: [{ ...proposed.blocks[0], props: { ...proposed.blocks[0].props, title: '<script>' } }] },
    { ...proposed, blocks: [proposed.blocks[0], { ...proposed.blocks[1], id: 'heading' }] }]) assert.throws(() => parseComposition(value));
});
test('stale, malformed and cross-session rollback cannot mutate another session', () => {
  const a = createBuilder(), b = createBuilder();
  const result = a.call({ operation: 'compose', expectedVersion: 0, composition: proposed });
  result.composition.blocks[0].props.title = 'tampered';
  assert.throws(() => a.call({ operation: 'compose', expectedVersion: 0, composition: proposed }));
  assert.throws(() => b.call({ operation: 'restore', expectedVersion: 0, version: 1 }));
  const restored = a.call({ operation: 'restore', expectedVersion: 1, version: 1 });
  assert.equal(restored.composition.blocks[0].props.title, 'Missions à préparer');
});
test('history bound and unsupported operations fail closed', () => {
  const builder = createBuilder();
  for (let i = 0; i < 49; i++) builder.call({ operation: 'compose', expectedVersion: i, composition: proposed });
  assert.throws(() => builder.call({ operation: 'compose', expectedVersion: 49, composition: proposed }));
  assert.throws(() => createBuilder().call({ operation: 'activate', composition: proposed }));
});
test('MausBot execute remains blocked even with enabled environment', () => {
  assert.deepEqual(mausbotReleasePermission({ ATLAS_MAUSBOT_RELEASE_STAGE: 'enabled' }, 'execute'), { allowed: false, code: 'MAUSBOT_DURABLE_APPROVAL_REQUIRED', status: 423 });
});

test('returned diff cannot mutate saved versions', () => {
  const builder = createBuilder();
  const result = builder.call({ operation: 'compose', expectedVersion: 0, composition: proposed });
  result.diff.added[0].props.injected = 'bad';
  result.diff.changed[0].props.title = 'corrupted';
  const restored = builder.call({ operation: 'restore', expectedVersion: 1, version: 1 });
  assert.deepEqual(restored.composition, proposed);
});
test('equivalent property ordering produces an empty diff', () => {
  const builder = createBuilder();
  const heading = BASE_COMPOSITION.blocks[0];
  const result = builder.call({ operation: 'compose', expectedVersion: 0, composition: {
    ...BASE_COMPOSITION, blocks: [{ ...heading, props: { description: heading.props.description, title: heading.props.title, eyebrow: heading.props.eyebrow } }],
  } });
  assert.deepEqual(result.diff, { added: [], removed: [], changed: [] });
});
test('reject sparse arrays, non-records, symbol fields and text boundaries', () => {
  const bad = [null, [], new Date(), { ...BASE_COMPOSITION, blocks: Array(1) },
    { ...BASE_COMPOSITION, [Symbol('hidden')]: true }];
  for (const title of ['', ' ', 'x'.repeat(161), 'https://example.com', 'bad\ntext', 42]) {
    bad.push({ ...BASE_COMPOSITION, blocks: [{ ...BASE_COMPOSITION.blocks[0], props: { ...BASE_COMPOSITION.blocks[0].props, title } }] });
  }
  for (const value of bad) assert.throws(() => parseComposition(value));
  assert.equal(parseComposition({ ...BASE_COMPOSITION, blocks: [{ ...BASE_COMPOSITION.blocks[0], props: { ...BASE_COMPOSITION.blocks[0].props, title: 'x'.repeat(160) } }] }).blocks[0].props.title.length, 160);
});
test('failed commands preserve version numbering and input snapshots', () => {
  const builder = createBuilder();
  for (const request of [{ operation: 'catalog', extra: true }, { operation: 'restore', expectedVersion: 0, version: -1 }, { operation: 'compose', expectedVersion: '0', composition: proposed }, { operation: 'compose', expectedVersion: 0, composition: {} }]) assert.throws(() => builder.call(request));
  const input = structuredClone(proposed);
  const first = builder.call({ operation: 'compose', expectedVersion: 0, composition: input });
  assert.equal(first.version, 1);
  input.blocks[0].props.title = 'changed outside';
  assert.deepEqual(builder.call({ operation: 'restore', expectedVersion: 1, version: 1 }).composition, proposed);
});
test('CLI malformed and oversized requests fail without contaminating session', () => {
  const input = ['{broken', ' '.repeat(8193), JSON.stringify({ operation: 'compose', expectedVersion: 0, composition: proposed })].join('\n');
  const run = spawnSync(process.execPath, ['scripts/ui-builder.mjs'], { encoding: 'utf8', input });
  assert.equal(run.status, 1);
  const output = run.stdout.trim().split('\n').map(JSON.parse);
  assert.equal(output[0].ok, false);
  assert.equal(output[1].error, 'Request too large');
  assert.equal(output[2].result.version, 1);
});

test('catalog and base are immutable, discovery returns detached data', () => {
  assert.throws(() => { BASE_COMPOSITION.blocks[0].props.title = 'poisoned'; });
  assert.throws(() => { CATALOG.components[0].props.title = 'unbounded'; });
  const builder = createBuilder();
  const discovery = builder.call({ operation: 'catalog' });
  discovery.catalog.components[0].props.title = 'unbounded';
  assert.equal(builder.call({ operation: 'catalog' }).catalog.components[0].props.title, 'text 1..160');
});
