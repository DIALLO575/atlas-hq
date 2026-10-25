import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { BASE_COMPOSITION, createBuilder, parseComposition } from '../src/lib/ui-studio/builder.ts';
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
