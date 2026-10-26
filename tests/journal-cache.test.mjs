import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CACHE_VERSION, createJournalCache, journalCacheScope, journalCacheKey, mergeJournalPayload, trimJournalEditions, cacheIsStale, safeCachedPayload } from '../packages/engines/mausbot/src/journal-cache.mjs';
import { journalEtag, journalEtagMatches } from '../packages/engines/mausbot/src/journal-etag.mjs';
function memoryAdapter() { let root=null; return { update: async fn => { const [next,result]=fn(structuredClone(root)); root=structuredClone(next); return result; } }; }
const ws='11111111-1111-4111-8111-111111111111';
const payload={editionId:'e1',items:[{id:'a',editionId:'e1',key:'["e1","a"]',state:'new',coverUrl:'signed'}],coverExpiresAt:'2026-10-26T10:00:00Z'};
const state={id:'operation-1',kind:'state',body:{workspaceId:ws,editionId:'e1',itemId:'a',status:'read'}};
test('scoped key, TTL and byte/edition limits',()=>{
 assert.notEqual(journalCacheKey('u',ws,'e'),journalCacheKey('v',ws,'e'));
 assert.equal(cacheIsStale({savedAt:0},59999),false); assert.equal(cacheIsStale({savedAt:0},60000),true);
 assert.equal(trimJournalEditions(Array.from({length:10},(_,i)=>({cacheVersion:CACHE_VERSION,savedAt:i})),10).length,7);
 assert.equal(trimJournalEditions([{cacheVersion:1,savedAt:0},{cacheVersion:CACHE_VERSION,savedAt:0}],8*86400000).length,0);
 assert.equal(trimJournalEditions([{cacheVersion:CACHE_VERSION,savedAt:1,payload:'x'.repeat(3*1024*1024)}],2).length,0);
});
test('hydrate, queue, purge and stale in-flight writes cannot resurrect data',async()=>{
 const adapter=memoryAdapter(); const cache=createJournalCache(adapter); const token=await cache.open(journalCacheScope('u',ws));
 await cache.save(token,payload,'"etag"',10); assert.equal((await cache.snapshot(token)).editions[0].payload.editionId,'e1');
 const reopened=await createJournalCache(adapter).open(token.scope); assert.deepEqual(reopened,token);
 await cache.enqueue(token,state); await cache.enqueue(token,state); assert.equal((await cache.snapshot(token)).queue.length,1);
 await assert.rejects(cache.enqueue(token,{...state,body:{...state.body,status:'done'}}));
 const merged=mergeJournalPayload(payload,payload,(await cache.snapshot(token)).queue); assert.equal(merged.items[0].state,'read');
 await cache.acknowledge(token,state.id);assert.equal((await cache.snapshot(token)).queue.length,0);
 await cache.purge(); assert.equal(await cache.save(token,payload,'old',20),false);assert.equal(await cache.snapshot(token),null);
});
test('switch owner/workspace and cache version invalidates editions and pending writes',async()=>{
 const cache=createJournalCache(memoryAdapter());const first=await cache.open(journalCacheScope('u',ws));await cache.save(first,payload,'tag',1);await cache.enqueue(first,state);
 const second=await cache.open(journalCacheScope('v',ws));assert.equal((await cache.snapshot(second)).editions.length,0); assert.equal(await cache.snapshot(first),null);
 const third=await cache.open(journalCacheScope('v','other'));assert.equal(await cache.save(second,payload,'tag',1),false);assert.equal((await cache.snapshot(third)).queue.length,0);
 const oldAdapter={update:async fn=>{const [root,token]=fn({cacheVersion:1,scope:first.scope,epoch:'old',editions:[payload]});assert.equal(root.editions.length,0);return token;}};await createJournalCache(oldAdapter).open(first.scope);
});
test('merge keeps stable references, pending state, new content and strips expired covers',()=>{
 const result=mergeJournalPayload(payload,structuredClone(payload));assert.equal(result.items[0],payload.items[0]);
 const changed=mergeJournalPayload(payload,{...payload,items:[{...payload.items[0],title:'new'}]},[state]); assert.equal(changed.items[0].title,'new');assert.equal(changed.items[0].state,'read');
 assert.equal(safeCachedPayload(payload,Date.parse('2026-10-26T11:00:00Z')).items[0].coverUrl,null);
});
test('ETag stable across signed URL rotation, changes for content/state and owner',()=>{
 const tag=journalEtag(payload,'u',ws);assert.equal(journalEtag({...payload,coverExpiresAt:'later',items:[{...payload.items[0],coverUrl:'new-signed'}]},'u',ws),tag);
 assert.notEqual(journalEtag({...payload,items:[{...payload.items[0],state:'done'}]},'u',ws),tag);assert.notEqual(journalEtag(payload,'v',ws),tag);
 assert(journalEtagMatches('W/'+tag+', "other"',tag));assert(!journalEtagMatches('"other"',tag));
});
test('SW stores public shell only; hook 304 returns before body/React replacement; logout purges',()=>{
 const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');const sw=read('public/sw.js');
 assert.match(sw,/url.pathname.startsWith\('\/api\/'\)\) return/);assert.doesNotMatch(sw,/cache.put\("\/journal"/);
 assert.match(sw,/journal-offline.html/);assert.match(sw,/keys.length-150/);
 const hook=read('src/components/journal/use-journal-data.ts');assert(hook.indexOf('response.status === 304')<hook.indexOf('const body = await response.json()'));
 assert.match(read('src/components/session-controls.tsx'),/await purgeJournalCache\(\); await signOut\(\)/);
});

test('offline cold reader requires matching per-tab capability and queues validated operations',()=>{
 const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');const offline=read('public/journal-offline.js');
 assert.match(offline,/sessionStorage.getItem\('atlas.journal.offline-capability'\)/);
 assert.match(offline,/storage.cache.snapshot\(token\)/);assert.match(offline,/kind:'state'/);assert.match(offline,/kind:'progress'/);
 assert.match(offline,/document.visibilityState==='visible'&&document.hasFocus\(\)/);assert.match(offline,/lastActivity<60000/);
 const storage=read('public/journal-cache-storage.mjs');assert.match(storage,/window.dispatchEvent\(new Event\('journal:purged'\)\)/);
  assert.match(storage,/localStorage\.removeItem\('atlas\.journal\.scope'\)/);
 assert.match(read('src/lib/journal/cache-storage.ts'),/public\/journal-cache-storage.mjs/);
});
