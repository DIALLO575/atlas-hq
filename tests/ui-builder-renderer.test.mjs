import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('builder renderer only imports existing Atlas page-element exports', () => {
  const renderer = readFileSync(new URL('../src/components/ui-builder-preview.tsx', import.meta.url), 'utf8');
  const elements = readFileSync(new URL('../src/components/page-elements.tsx', import.meta.url), 'utf8');
  const imports = renderer.match(/import\s*\{([^}]+)\}\s*from\s*['"]@\/components\/page-elements['"]/);
  assert(imports, 'Atlas element import is explicit');
  const exports = new Set([...elements.matchAll(/export function (\w+)\(/g)].map(match => match[1]));
  for (const name of imports[1].split(',').map(value => value.trim())) assert(exports.has(name), `Missing page-elements export: ${name}`);
});
