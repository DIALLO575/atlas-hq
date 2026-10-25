import test from "node:test";
import assert from "node:assert/strict";
import { mausbotMessageDelta, mergeMausbotMessages, lastMausbotMessageId,
 rememberMausbotThread, MAUSBOT_MESSAGE_CACHE_LIMIT, MAUSBOT_THREAD_CACHE_LIMIT,
 MAUSBOT_THREAD_CACHE_TTL_MS } from "../packages/engines/mausbot/src/message-updates.mjs";

const m=(id,text=id)=>({id,at:"2026-10-25T12:00:00Z",role:"assistant",kind:"text",text});
test("delta sends only the changed tail and a two-message overlap",()=>{
 const list=[m("a"),m("b"),m("c"),m("d"),m("e")];
 assert.deepEqual(mausbotMessageDelta(list,"d"),{reset:false,messages:[m("b"),m("c"),m("d"),m("e")]});
 assert.deepEqual(mausbotMessageDelta(list,"unknown"),{reset:true,messages:list});
 assert.deepEqual(mausbotMessageDelta(list,null),{reset:true,messages:list});
});
test("merge does not re-render for identical responses; accepts edits and new arrivals",()=>{
 const first=[m("a"),m("b")];
 assert.equal(mergeMausbotMessages(first,[m("a"),m("b")]),first);
 const second=mergeMausbotMessages(first,[m("b","edited"),m("c")]);
 assert.deepEqual(second,[m("a"),m("b","edited"),m("c")]);
 assert.deepEqual(first,[m("a"),m("b")]);
 assert.equal(lastMausbotMessageId(second),"c");
 assert.deepEqual(mergeMausbotMessages(second,[m("x")],true),[m("x")]);
});
test("memory cache uses LRU, expiry and bounded size",()=>{
 const map=new Map();
 for(let i=0;i<MAUSBOT_THREAD_CACHE_LIMIT+2;i++)rememberMausbotThread(map,"ws|bot|"+i,[m(String(i))],10+i);
 assert.equal(map.size,MAUSBOT_THREAD_CACHE_LIMIT);
 assert.equal(map.has("ws|bot|0"),false);
 rememberMausbotThread(map,"fresh",[m("current")],MAUSBOT_THREAD_CACHE_TTL_MS+30);
 assert.equal(map.size,1);
 const big=Array.from({length:MAUSBOT_MESSAGE_CACHE_LIMIT+33},(_,i)=>m(String(i)));
 assert.equal(mergeMausbotMessages([],big).length,MAUSBOT_MESSAGE_CACHE_LIMIT);
});
