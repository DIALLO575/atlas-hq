import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('Foliate relocate fraction is already a whole-book fraction, and section is nested', () => {
  const library = source('src/components/books/book-library.tsx');
  assert.match(library, /event\.detail\.section\?\.current/);
  assert.match(library, /positionRef\.current = Math\.min\(1, Math\.max\(0, fraction\)\)/);
  assert.doesNotMatch(library, /\(currentSection\.current \+ \(event\.detail\.fraction/);
  assert.match(library, /element\.goTo\(\{ fraction: safeResume \}\)/);
});
test('reader offers navigation to exact fraction, keyboard paging and annotation anchors', () => {
  const library = source('src/components/books/book-library.tsx');
  assert.match(library, /onChange=\{event => void reader\?\.goTo\(\{ fraction: Number\(event\.currentTarget\.value\) \/ 100 \}\)\}/);
  assert.match(library, /reader\.goRight/);
  assert.match(library, /reader\.goLeft/);
  assert.match(library, /reader\?\.goTo\(note\.anchor_cfi \|\| \{ fraction: note\.position \}\)/);
  assert.match(library, /previous\?\.kind \?\? kind/);
  assert.match(library, /previous\?\.anchor_cfi \?\? null/);
});
test('offline reading resumes, turns pages and replays note mutations with correct HTTP verbs', () => {
  const offline = source('public/lecture-offline.js');
  const html = source('public/lecture-offline.html');
  assert.match(offline, /view\.goTo\(\{fraction:Math\.max\(0,Math\.min\(1,position\)\)\}\)/);
  assert.match(offline, /item\.kind==='annotation_delete'\?'DELETE'/);
  assert.match(offline, /item\.body\.id\?'PATCH':'POST'/);
  assert.match(offline, /response\.redirected/);
  assert.match(html, /id="prev"/);
  assert.match(html, /id="next"/);
  assert.match(html, /id="progress"/);
});
