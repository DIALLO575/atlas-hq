import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { AGENT_POLL_ACTIVE_MS,AGENT_POLL_IDLE_MS,createAgentPollScheduler } from "../src/lib/agent-gateway/poll-scheduler.mjs";
import { mausbotReleasePermission,mausbotReleaseState } from "../packages/engine-core/src/release-gates.mjs";
const source=path=>readFile(new URL(path,import.meta.url),"utf8");
const flush=()=>new Promise(resolve=>setImmediate(resolve));
function clock(){
 let now=100000,n=0;const tasks=new Map(),listeners=new Set();
 const visibility={visibilityState:"visible",hidden:false,
  addEventListener(type,cb){assert.equal(type,"visibilitychange");listeners.add(cb);},
  removeEventListener(type,cb){assert.equal(type,"visibilitychange");listeners.delete(cb);},
  change(hidden){this.hidden=hidden;this.visibilityState=hidden?"hidden":"visible";for(const cb of listeners)cb();}};
 return {visibility,tasks,now:()=>now,setTimer(cb,delay){const id=++n;tasks.set(id,{due:now+delay,cb});return id;},
 clearTimer(id){tasks.delete(id);},async advance(delta){
  const end=now+delta;while(true){const due=[...tasks].filter(([,t])=>t.due<=end).sort((a,b)=>a[1].due-b[1].due);
   if(!due.length)break;const [id,t]=due[0];tasks.delete(id);now=t.due;t.cb();await flush();}
  now=end;await flush();
 }};
}
test("B2 2s active, 15s idle, zero hidden polling and controlled resume",async()=>{
 assert.equal(AGENT_POLL_ACTIVE_MS,2000);assert.equal(AGENT_POLL_IDLE_MS,15000);
 const c=clock();let n=0,active=true;
 const scheduler=createAgentPollScheduler({visibility:c.visibility,setTimer:c.setTimer,clearTimer:c.clearTimer,now:c.now,
 isActive:()=>active,load:async signal=>{assert.equal(signal.aborted,false);n++;}});
 scheduler.start();await c.advance(0);assert.equal(n,1);
 await c.advance(1999);assert.equal(n,1);await c.advance(1);assert.equal(n,2);
 active=false;await c.advance(2000);assert.equal(n,3);
 await c.advance(14999);assert.equal(n,3);
 c.visibility.change(true);await c.advance(300000);assert.equal(n,3);assert.equal(c.tasks.size,0);
 c.visibility.change(false);await c.advance(0);assert.equal(n,4);
 await c.advance(15000);assert.equal(n,5);
 scheduler.stop();await c.advance(50000);assert.equal(n,5);
});
test("B2 no parallel requests, abort on hide, never start while hidden",async()=>{
 const c=clock();let n=0,aborted=0,errors=0;
 c.visibility.change(true);
 const scheduler=createAgentPollScheduler({visibility:c.visibility,setTimer:c.setTimer,clearTimer:c.clearTimer,now:c.now,
 isActive:()=>true,onError:()=>errors++,
 load:signal=>{n++;if(n>1)return Promise.resolve();return new Promise(resolve=>{
 signal.addEventListener("abort",()=>{aborted++;resolve();},{once:true});});}});
 scheduler.start();await c.advance(100000);assert.equal(n,0);
 c.visibility.change(false);await c.advance(0);assert.equal(n,1);
 await c.advance(90000);assert.equal(n,1);
 c.visibility.change(true);await flush();assert.equal(aborted,1);
 await c.advance(90000);assert.equal(n,1);
 c.visibility.change(false);await c.advance(0);assert.equal(n,2);
 assert.equal(errors,0);scheduler.stop();
});
test("B2 object history authorized and read from existing agent_threads, no fabricated data",async()=>{
 const [g,route,panel,mission]=await Promise.all([
 source("../src/lib/agent-gateway/index.ts"),source("../src/app/api/agent/thread/route.ts"),
 source("../src/components/agent-panel.tsx"),source("../src/app/missions/page.tsx")]);
 const history=g.slice(g.indexOf("export async function historyForObject"),g.indexOf("export async function prepareInterrupt"));
 assert.match(history,/requireAgentOwner\(workspaceId\)/);
 assert.match(history,/verifyScope\(supabase, context\)/);
 assert.match(history,/findThread\(supabase, context\)/);
 assert.match(history,/return poll\(workspaceId, thread\.id\)/);
 assert.doesNotMatch(history,/\.insert\(|\.upsert\(|\.delete\(/);
 assert.match(route,/query\.get\("objectId"\)/);
 assert.match(route,/query\.get\("threadId"\)/);
 assert.match(mission,/selectedMissionId \?\? "page"/);
 assert.match(panel,/qs\.set\("pageKey","missions"\)/);
 assert.match(panel,/lastIdRef\.current/);
});
test("B2 interruption is authenticated and always 423; write gate never opens",async()=>{
 const [g,route,css,panel]=await Promise.all([
 source("../src/lib/agent-gateway/index.ts"),
 source("../src/app/api/agent/interrupt/route.ts"),
 source("../src/components/agent-panel.module.css"),
 source("../src/components/agent-panel.tsx")]);
 const interrupt=g.slice(g.indexOf("export async function prepareInterrupt"));
 assert.match(interrupt,/mausbotReleasePermission\(process\.env, "execute"\)/);
 assert.match(interrupt,/MAUSBOT_DURABLE_APPROVAL_REQUIRED/);
 assert.doesNotMatch(interrupt,/executeMausbotPrimitive|mausbotRequest|fetch\(/);
 assert.match(route,/request\.headers\.get\("origin"\) !== request\.nextUrl\.origin/);
 assert.match(route,/prepareInterrupt\(/);
 assert.match(route,/status: 423/);
 for(const stage of [undefined,"read-only","enabled","admin"]){
 const env={ATLAS_MAUSBOT_RELEASE_STAGE:stage};
 assert.equal(mausbotReleaseState(env).mutationsEnabled,false);
 assert.equal(mausbotReleasePermission(env,"execute").status,423);
 }
 assert.match(panel,/writeLocked/);assert.match(panel,/Interrompre/);
 assert.match(css,/@media\(max-width:390px\)/);
 assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
});
test("B2 shortcut drafts and measured real-message bubbles; no mock replies",async()=>{
 const [p,css]=await Promise.all([
 source("../src/components/agent-panel.tsx"),source("../src/components/agent-panel.module.css")]);
 for(const title of ["Explique","Résume","Fais une fiche"])assert.ok(p.includes(title));
 const compose=p.slice(p.indexOf("const prefill="),p.indexOf("const dismiss="));
 assert.match(compose,/setQuestion\(shortcut\.template\+target\)/);
 assert.doesNotMatch(compose,/fetch\(|send\(/);
 assert.match(p,/const receivedAt=performance\.now\(\)/);
 assert.match(p,/lastBatchReceivedAt\.current=receivedAt/);
 assert.match(p,/requestAnimationFrame\(\(\)=>/);
 assert.match(p,/performance\.now\(\)-receivedAt/);
 assert.match(css,/@keyframes atlasAgentBubble/);
 assert.match(css,/@keyframes atlasAgentDots/);
 assert.match(p,/Aucun message réel reçu pour cette page/);
 assert.match(p,/createAgentPollScheduler/);
 assert.doesNotMatch(p,/setInterval\(|fakeReply|mockResponse|demoMessages/);
});
