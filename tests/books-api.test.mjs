import test from 'node:test';
import assert from 'node:assert/strict';
import { BOOK_FINISHED_THRESHOLD, BOOK_FORMATS, booksEtag, etagMatches, validateCreateBook, validateProgress } from '../packages/engines/mausbot/src/books.mjs';
const workspaceId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', sendId='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', bookId='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const event={bookId,deltaSeconds:30,position:.98,clientUpdatedAt:'2026-10-26T11:00:00.000Z',pagesRead:42};
test('accepts EPUB and PDF upload metadata only within MIME and size bounds',()=>{for(const format of ['epub','pdf'])assert.ok(validateCreateBook({workspaceId,title:'  Book  ',format,mimeType:BOOK_FORMATS[format],byteSize:1}));assert.equal(validateCreateBook({workspaceId,title:'x',format:'pdf',mimeType:BOOK_FORMATS.epub,byteSize:1}),null);assert.equal(validateCreateBook({workspaceId,title:'x',format:'epub',mimeType:BOOK_FORMATS.epub,byteSize:104857601}),null);assert.equal(validateCreateBook({workspaceId,title:'  ',format:'pdf',mimeType:BOOK_FORMATS.pdf,byteSize:2}),null)});
test('validates bounded, unique progress batches and 98% completion threshold',()=>{assert.ok(validateProgress({workspaceId,sendId,events:[event]}));assert.equal(BOOK_FINISHED_THRESHOLD,.98);assert.equal(validateProgress({workspaceId,sendId,events:[event,event]}),null);assert.equal(validateProgress({workspaceId,sendId,events:[{...event,deltaSeconds:121}]}),null);assert.equal(validateProgress({workspaceId,sendId,events:[{...event,position:1.01}]}),null);assert.equal(validateProgress({workspaceId,sendId,events:[{...event,extra:true}]}),null)});
test('ETags are stable for same owner/workspace payload and distinguish scope',()=>{const payload={books:[{id:bookId}]};const etag=booksEtag(payload,'user-a',workspaceId);assert.equal(booksEtag(payload,'user-a',workspaceId),etag);assert.notEqual(booksEtag(payload,'user-b',workspaceId),etag);assert.notEqual(booksEtag(payload,'user-a','dddddddd-dddd-4ddd-8ddd-dddddddddddd'),etag);assert.equal(etagMatches(`W/${etag}`,etag),true);assert.equal(etagMatches('"other"',etag),false)});

test('Vercel automatic deployments stay disabled only for the feature branch', async()=>{
 const {readFile}=await import('node:fs/promises'); const config=JSON.parse(await readFile(new URL('../vercel.json',import.meta.url),'utf8'));
 assert.equal(config.git.deploymentEnabled['feat/lecture-livres-l1'],false);
});
