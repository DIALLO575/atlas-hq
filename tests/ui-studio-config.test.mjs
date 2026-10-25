import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CONFIG, parseConfig, saveVersion, restoreVersion } from '../src/lib/ui-studio/config.ts';

test('allowlisted configuration accepts both densities and accents', () => {
  for (const density of ['compact', 'comfortable']) for (const accent of ['blue', 'green']) assert.deepEqual(parseConfig({ schemaVersion: 1, density, accent }), { schemaVersion: 1, density, accent });
});
test('rejects arbitrary code, properties, versions and invalid values', () => {
  for (const value of [null, [], 'alert(1)', {}, { ...DEFAULT_CONFIG, script: 'alert(1)' }, { ...DEFAULT_CONFIG, density: 'url(https://example.com)' }, { ...DEFAULT_CONFIG, accent: '<script>' }, { ...DEFAULT_CONFIG, schemaVersion: 2 }]) assert.throws(() => parseConfig(value));
});
test('versions snapshot drafts and restore without changing the reference', () => {
  const draft = { ...DEFAULT_CONFIG, density: 'compact' };
  let versions = saveVersion([], DEFAULT_CONFIG);
  versions = saveVersion(versions, draft);
  draft.density = 'comfortable';
  assert.equal(restoreVersion(versions, 2).density, 'compact');
  assert.deepEqual(restoreVersion(versions, 1), DEFAULT_CONFIG);
  assert.equal(DEFAULT_CONFIG.density, 'comfortable');
  assert.throws(() => restoreVersion(versions, 99));
});
test('independent editor histories cannot restore each other’s versions', () => {
  const first = saveVersion([], { ...DEFAULT_CONFIG, accent: 'green' });
  const second = [];
  assert.throws(() => restoreVersion(second, first[0].id));
  assert.equal(second.length, 0);
});
test('bounds in-memory history', () => {
  let versions = [];
  for (let n = 0; n < 50; n++) versions = saveVersion(versions, DEFAULT_CONFIG);
  assert.throws(() => saveVersion(versions, DEFAULT_CONFIG));
});
