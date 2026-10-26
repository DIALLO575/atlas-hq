import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');

test('L2 exposes responsive library and reader routes with EPUB/PDF engines', () => {
  const library = read('../src/components/books/book-library.tsx');
  assert.match(read('../src/app/lecture/page.tsx'), /BookLibrary/);
  assert.match(read('../src/app/lecture/[id]/page.tsx'), /readerId={id}/);
  assert.match(library, /foliate-js\/view\.js/);
  assert.match(library, /element\.open\(readerFile\)/);
  assert.match(read('../public/vendor/foliate-js/pdf.js'), /pdfjsLib/);
  assert.match(library, /"night"/);
  assert.match(library, /Georgia, serif/);
  assert.match(library, /monospace/);
  assert.match(library, /sameSet/);
});

test('automatic covers are local canvas assets, compressed in two sizes, and replaceable', () => {
  const library = read('../src/components/books/book-library.tsx');
  const route = read('../src/app/api/engines/mausbot/books/[id]/cover/route.ts');
  assert.match(library, /canvasImage\(title, author, palette, seed, 720\)/);
  assert.match(library, /canvasImage\(title, author, palette, seed, 240\)/);
  assert.match(library, /createImageBitmap/);
  assert.match(library, /Régénérer/);
  assert.match(library, /accept="image\/jpeg,image\/png,image\/webp"/);
  assert.match(route, /createSignedUploadUrl/);
  assert.match(route, /createSignedUrl\([^,]+,300\)/);
  assert.match(route, /cover_thumb_path:null/);
  assert.doesNotMatch(library, /openai|replicate|stability\.ai|api_key/i);
});

test('cover and annotation migrations remain additive and have matching manual rollback scripts', () => {
  for (const migration of ['20261026133000_atlas_book_covers', '20261026133500_atlas_book_annotation_anchor']) {
    const sql = read(`../supabase/migrations/${migration}.sql`);
    const rollback = read(`../supabase/rollback/${migration}.sql`);
    assert.match(sql, /BEGIN;/);
    assert.match(sql, /COMMIT;/);
    assert.match(rollback, /BEGIN;/);
    assert.match(rollback, /COMMIT;/);
    assert.doesNotMatch(sql, /DROP TABLE|TRUNCATE|DELETE FROM/i);
  }
  assert.match(read('../supabase/migrations/20261026133000_atlas_book_covers.sql'), /ADD COLUMN cover_path/);
  assert.match(read('../supabase/migrations/20261026133000_atlas_book_covers.sql'), /ADD COLUMN cover_thumb_path/);
  assert.match(read('../supabase/migrations/20261026133500_atlas_book_annotation_anchor.sql'), /ADD COLUMN anchor_cfi/);
  assert.match(read('../.github/workflows/ci.yml'), /20261026133000_atlas_book_covers\.sql/);
  assert.match(read('../.github/workflows/ci.yml'), /20261026133500_atlas_book_annotation_anchor\.sql/);
});

test('preview builds are skipped for the books source branches without disabling main', () => {
  assert.match(read('../netlify.toml'), /netlify-ignore-lecture-livres\.js/);
  assert.match(read('../vercel.json'), /"feat\/lecture-livres-l1": false/);
  assert.match(read('../vercel.json'), /"fix\/lecture-open-book-r1": false/);
  const script = new URL('../scripts/netlify-ignore-lecture-livres.js', import.meta.url).pathname;
  assert.equal(spawnSync(process.execPath, [script], { env: { ...process.env, BRANCH: 'feat/lecture-livres-l1' } }).status, 0);
  assert.equal(spawnSync(process.execPath, [script], { env: { ...process.env, BRANCH: 'fix/lecture-open-book-r1' } }).status, 0);
  assert.equal(spawnSync(process.execPath, [script], { env: { ...process.env, BRANCH: 'main' } }).status, 1);
});

test('the reader persists selected text anchors and routes all progress through the L1 RPC API', () => {
  const library = read('../src/components/books/book-library.tsx');
  const notes = read('../src/app/api/engines/mausbot/books/notes/route.ts');
  assert.match(library, /getCFI\(range\.index, range\.range\)/);
  assert.match(library, /addAnnotation\(/);
  assert.match(library, /anchorCfi/);
  assert.match(notes, /anchor_cfi/);
  assert.match(library, /fetch\(`\$\{API\}\/progress`/);
  assert.match(read('../src/app/api/engines/mausbot/books/progress/route.ts'), /rpc\('book_record_progress_batch'/);
});
