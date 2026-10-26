import test from 'node:test';
import assert from 'node:assert/strict';
import { createBooksOfflineCache, bookCacheScope } from '../packages/engines/mausbot/src/books-offline.mjs';

const user='11111111-1111-4111-8111-111111111111', workspace='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', book='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
function sharedAdapter() {
 const roots=new Map(); let tail=Promise.resolve();
 return { update(scope, transform) { const run=tail.then(()=>{ const [next,result]=transform(structuredClone(roots.get(scope)??null)); if(next) roots.set(scope,structuredClone(next)); else roots.delete(scope); return result; }); tail=run.catch(()=>{}); return run; }, async clear(){roots.clear();} };
}
test('book offline cache scopes users/workspaces and gates old capabilities after purge',async()=>{
 const adapter=sharedAdapter(), a=createBooksOfflineCache(adapter), b=createBooksOfflineCache(adapter), one=await a.open(user,workspace), two=await b.open('22222222-2222-4222-8222-222222222222',workspace);
 assert.notEqual(one.scope,two.scope); assert.equal(bookCacheScope(user,workspace),one.scope);
 await a.saveBook(one,{id:book,title:'Atlas',author:'A',format:'epub',status:'active'});
 assert.ok((await b.snapshot(two)).books[book]===undefined);
 await a.purge(); assert.equal(await b.snapshot(two),null);
});
test('indexeddb-multitab: simultaneous tabs enqueue the same send_id once and reject changed replay payloads',async()=>{
 const adapter=sharedAdapter(), tabA=createBooksOfflineCache(adapter), tabB=createBooksOfflineCache(adapter), a=await tabA.open(user,workspace), b=await tabB.open(user,workspace);
 const operation={kind:'progress',sendId:'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',queuedAt:1,body:{workspaceId:workspace,sendId:'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',events:[{bookId:book,deltaSeconds:10,position:.4,pagesRead:null,clientUpdatedAt:'2026-10-26T12:00:00Z',deviceId:'11111111-1111-4111-8111-111111111111'}]}};
 await Promise.all([tabA.enqueue(a,operation),tabB.enqueue(b,operation)]); assert.equal((await tabA.queue(a)).length,1);
 await assert.rejects(tabB.enqueue(b,{...operation,body:{...operation.body,events:[{...operation.body.events[0],deltaSeconds:11}]}}),/BOOK_QUEUE_SEND_ID_CONFLICT/);
 await tabA.acknowledge(a,operation.sendId); assert.equal((await tabB.queue(b)).length,0);
});
