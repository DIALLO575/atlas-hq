import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { normalizeMausbotNeedsYou, readMausbotNeedsYou, MAUSBOT_NEEDS_YOU_KINDS } from "../packages/engines/mausbot/src/needs-you.mjs";

const input = {items:[
  {kind:"signed-out",id:"signed-out:engine-1",at:100,instanceId:"engine-1",botIds:["a"],internalToken:"SECRET"},
  {kind:"usage-limit",id:"quota-1",at:105,instanceId:"engine-1",botIds:["a"],threadId:"thread-1",text:"PRIVATE BILLING"},
  {kind:"out-of-credit",id:"credit-1",at:104,credit:{card:"SECRET"},botIds:["a"],threadId:"thread-1"},
  {kind:"connection",id:"connection-1",at:103,app:"Google Drive",botIds:["a"],threadId:"thread-1",text:"SECRET oauth"},
  {kind:"place",id:"place-1",at:102,place:{credentials:"SECRET",path:"/secret"},botIds:["a"],threadId:"thread-1"},
  {kind:"question",id:"ask-1",at:101,botId:"a",threadId:"thread-1",text:"Puis-je continuer ?",request:{secret:"SECRET"}},
]};
test("Six source-defined Needs You kinds are projected but no raw approval/action/secrets leak",()=>{
  assert.equal(MAUSBOT_NEEDS_YOU_KINDS.length,6);
  const result=normalizeMausbotNeedsYou(input);
  assert.equal(result.source,"live-read-only");
  assert.equal(result.canDispatch,false);
  assert.equal(result.canApprove,false);
  assert.equal(result.windowDays,7);
  assert.equal(result.items.length,6);
  assert.deepEqual(result.items.map(i=>i.kind),["usage-limit","out-of-credit","connection","place","question","signed-out"]);
  assert.equal(result.items.find(i=>i.kind==="signed-out").id,"signed-out:engine-1");
  assert.equal(result.items.find(i=>i.kind==="question").text,"Puis-je continuer ?");
  const printed=JSON.stringify(result);
  for(const word of ["SECRET","PRIVATE BILLING","/secret","credentials","approvalMode","requestId","token"]) {
    assert.equal(printed.includes(word),false,"leaked "+word);
  }
});
test("Malformed responses fail closed rather than inventing a zero-notifications state",()=>{
  for(const payload of [
    null,{}, {items:{}}, {items:Array.from({length:301},()=>input.items[0])},
    {items:[{...input.items[0],at:"yesterday"}]},
    {items:[{...input.items[0],id:"bad/../../"}]},
    {items:[{...input.items[5],threadId:"../bad"}]},
    {items:[{...input.items[4],botIds:["ok",123]}]},
    {items:[{...input.items[0],kind:"approval"}]},
    {items:[{...input.items[0],at:8_640_000_000_000_001}]},
  ]) assert.throws(()=>normalizeMausbotNeedsYou(payload),e=>e.code==="MAUSBOT_NEEDS_YOU_INVALID");
});
test("GET is fixed upstream, bearer stays server-side, no redirects, no mutation",async()=>{
  const seen=[];
  const reply=await readMausbotNeedsYou({baseUrl:"https://maus.test",token:"SERVER_BEARER"},{
    fetchImpl:async (url,opts)=>{seen.push({url,opts});return Response.json(input);},
  });
  assert.equal(reply.items.length,6);
  assert.equal(seen.length,1);
  assert.equal(seen[0].url,"https://maus.test/api/needs-you");
  assert.equal(seen[0].opts.method,"GET");
  assert.equal(seen[0].opts.redirect,"manual");
  assert.equal(seen[0].opts.cache,"no-store");
  assert.equal(seen[0].opts.headers.Authorization,"Bearer SERVER_BEARER");
  assert.equal(JSON.stringify(reply).includes("SERVER_BEARER"),false);
});
test("ATLAS Inbox and homepage display source verified status; the engine route has mandatory identity + release gates",()=>{
  const route=readFileSync(new URL("../src/app/api/engines/mausbot/needs-you/route.ts",import.meta.url),"utf8");
  const inbox=readFileSync(new URL("../src/app/inbox/page.tsx",import.meta.url),"utf8");
  const home=readFileSync(new URL("../src/app/page.tsx",import.meta.url),"utf8");
  const ui=readFileSync(new URL("../src/components/mausbot-needs-you.tsx",import.meta.url),"utf8");
  const css=readFileSync(new URL("../src/app/mausbot-needs-you.css",import.meta.url),"utf8");
  assert.match(route,/requireEngineWorkspace\(workspaceId, true\)/);
  assert.match(route,/mausbotReleasePermission\(process\.env,"read"\)/);
  assert.match(route,/ATLAS_MAUSBOT_NEEDS_YOU_IDENTITY_VERIFIED/);
  assert.ok(route.indexOf("mausbotReleasePermission")<route.indexOf("resolveMausbotConfig"));
  assert.ok(route.indexOf("ATLAS_MAUSBOT_NEEDS_YOU_IDENTITY_VERIFIED")<route.indexOf("resolveMausbotConfig"));
  assert.doesNotMatch(route,/export async function POST|service_role|MAUSBOT_TOKEN\s*:/);
  assert.match(inbox, /<MausbotNeedsYou workspaceId=\{data\.selected\.id\}/);
  assert.match(home, /<MausbotNeedsYou mode="home"/);
  assert.match(inbox,/decideAtlasMissionReview/);
  assert.match(ui,/credentials:"same-origin"/);
  assert.match(ui,/cache:"no-store"/);
  assert.match(ui,/canApprove!==false/);
  assert.match(ui,/HTTP 423/);
  assert.doesNotMatch(ui,/mausbotDispatch|method:"POST"|window\.localStorage/);
  assert.match(css,/@media\(max-width:720px\)/);
});
