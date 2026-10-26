import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const route=path=>readFile(new URL(`../src/app/api/engines/mausbot/books/${path}`,import.meta.url),'utf8');
test('books L1 exposes scoped API route families with owner gate, 307 sign-in and conditional ETags',async()=>{
 const [list,detail,progress,notes,summary,access]=await Promise.all([route('route.ts'),route('[id]/route.ts'),route('progress/route.ts'),route('notes/route.ts'),route('summary/route.ts'),readFile(new URL('../src/lib/engines/book-access.ts',import.meta.url),'utf8')]);
 assert.match(list,/export async function GET/);assert.match(list,/export async function POST/);assert.match(detail,/export async function PATCH/);assert.match(detail,/export async function DELETE/);assert.match(progress,/rpc\('book_record_progress_batch'/);assert.match(progress,/error\.code==='22P02'\?'BOOK_PROGRESS_INVALID'/);assert.match(notes,/book_annotations/);assert.match(summary,/goalSeconds:1800/);
 for(const source of [list,detail,progress,notes,summary]){assert.match(source,/requireBookOwner/);if(source.includes('export async function GET'))assert.match(source,/etagMatches/)}
 assert.match(access,/NextResponse\.redirect\(url,307\)/);assert.match(access,/role!=='owner'/);
});
