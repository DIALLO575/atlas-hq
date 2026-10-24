import test from "node:test";
import assert from "node:assert/strict";
import { nativePrimitive } from "../packages/engine-core/src/native-capabilities.mjs";
import { EVENT_AUTOMATION_READS, EVENT_AUTOMATION_PLANS, EventAutomationContractError,
  planEventAutomationRead, executeEventAutomationRead, planEventAutomationMutation,
  planMausbotEventReplay, reconcileMausbotEvent } from "../packages/engines/mausbot/src/event-automation.mjs";
const config={baseUrl:"https://maus.test",token:"NOT_REAL_BEARER"};
const fixtures={
  "/api/webhooks":{webhooks:[{id:"hook1",enabled:true,delivery:"run",runOn:"cloud",
    deliveryCount:3,verificationPending:false,lastReceivedAt:123,endpointId:"SECRET",
    secret:"SENSITIVE",sealedSecret:"SENSITIVE",prompt:"PRIVATE",name:"PRIVATE"}],
    attempts:[{id:"PRIVATE",webhookId:"hook1",payload:"SENSITIVE"}],
    ingress:{available:true,baseUrl:"https://SECRET/hook"}},
  "/api/routines":{routines:[{id:"routine1",enabled:false,target:"bot",
    prompt:"SENSITIVE PROMPT",name:"PRIVATE",lastRunAt:123}],
    runs:[{id:"run1",routineId:"routine1",status:"failed",
      report:"SENSITIVE",startedAt:123,finishedAt:124}]},
  "/api/notifications":{notifications:[{id:"notif1",kind:"approval",read:false,at:100,
    body:"PRIVATE",title:"SENSITIVE",threadId:"PRIVATE",avatarUrl:"https://SECRET"}]},
  "/api/threads/thread1/job":{threadId:"thread1",scope:"job",since:100,now:230,
    state:"needs-input",version:"g0od-abc",reason:"SECRET",
    nodes:[{id:"node1",question:"PRIVATE QUESTION",result:"SENSITIVE"}],
    needsInput:[{id:"node1",question:"PRIVATE"}],counts:{
      queued:0,running:0,waiting:0,needsInput:1,completed:0,failed:0,cancelled:0}},
};
function mock(seen,overrides={}) {
  return async (address,opts)=>{
    const url=new URL(address);
    seen.push({path:url.pathname,search:url.searchParams,opts});
    return Response.json(Object.hasOwn(overrides,url.pathname)?overrides[url.pathname]:fixtures[url.pathname]);
  };
}
test("All four reads are exact source-mapped, mock-only and never publicly callable",()=>{
  assert.equal(EVENT_AUTOMATION_READS.length,4);
  for(const name of EVENT_AUTOMATION_READS){
    const input=name==="jobs.snapshot"?{threadId:"thread1"}:{};
    const p=planEventAutomationRead(name,input);
    assert.equal(p.method,"GET"); assert.equal(p.released,false);
    assert.equal(p.callable,false); assert.equal(p.hostTested,false);
    assert.equal(nativePrimitive(name).method,"GET");
  }
});
for(const name of EVENT_AUTOMATION_READS){
  test(name+" projects safe metadata and drops secret event content",async()=>{
    const seen=[];
    const data=await executeEventAutomationRead(config,name,
      name==="jobs.snapshot"?{threadId:"thread1"}:{},{fetchImpl:mock(seen)});
    assert.equal(data.primitive,name);
    assert.equal(data.mode,"metadata-only");
    assert.equal(data.untrusted,true);
    assert.equal(seen.length,1);
    assert.equal(seen[0].opts.method,"GET");
    assert.equal(seen[0].opts.redirect,"manual");
    assert.equal(seen[0].opts.headers.Authorization,"Bearer NOT_REAL_BEARER");
    const serialized=JSON.stringify(data);
    for(const sensitive of ["SENSITIVE","SECRET","PRIVATE","NOT_REAL_BEARER","https://"])
      assert.equal(serialized.includes(sensitive),false,name+" leaked "+sensitive);
  });
}
test("Job semantics preserve needs-input and never declare unknown/failed states successful",async()=>{
  const needs=await executeEventAutomationRead(config,"jobs.snapshot",{threadId:"thread1"},
    {fetchImpl:mock([])});
  assert.equal(needs.state,"needs-input");
  assert.equal(needs.requiresAttention,true);
  assert.equal(needs.confirmedComplete,false);
  assert.equal(needs.needsInputCount,1);
  const statuses=[["failed",true,false],["stalled",true,false],["running",false,false],
    ["idle",false,false],["completed",false,true]];
  for(const [state,requiresAttention,complete] of statuses){
    const data=await executeEventAutomationRead(config,"jobs.snapshot",{threadId:"thread1"},
      {fetchImpl:mock([],{"/api/threads/thread1/job":{...fixtures["/api/threads/thread1/job"],state,
        needsInput:[],counts:{queued:0,running:0,waiting:0,needsInput:0,completed:1,failed:0,cancelled:0}}})});
    assert.equal(data.requiresAttention,requiresAttention,state);
    assert.equal(data.confirmedComplete,complete,state);
  }
  const failure=await executeEventAutomationRead(config,"jobs.snapshot",{threadId:"thread1"},
    {fetchImpl:mock([],{"/api/threads/thread1/job":{...fixtures["/api/threads/thread1/job"],
      state:"completed",counts:{queued:0,running:0,waiting:0,needsInput:0,completed:1,failed:1,cancelled:0}}})});
  assert.equal(failure.confirmedComplete,false);
});
test("Job cursor, wait, thread, scope and URL are bounded and never caller-defined",()=>{
  const p=planEventAutomationRead("jobs.snapshot",{threadId:"thread1",since:200,wait:25000,version:"v-1"});
  const url=new URL("https://example.test"+p.path);
  assert.equal(url.pathname,"/api/threads/thread1/job");
  assert.equal(url.searchParams.get("scope"),"job");
  assert.equal(url.searchParams.get("wait"),"25000");
  assert.equal(url.searchParams.get("since"),"200");
  for(const input of [
    {threadId:"../bad"}, {threadId:"thread1",wait:25001},
    {threadId:"thread1",wait:-1}, {threadId:"thread1",since:-1},
    {threadId:"thread1",since:3.1}, {threadId:"thread1",version:"bad&x"},
    {threadId:"thread1",scope:"turn"}, {threadId:"thread1",full:1},
    {threadId:"thread1",approval:true}
  ]) assert.throws(()=>planEventAutomationRead("jobs.snapshot",input),EventAutomationContractError);
});
test("Malformed upstream fails closed with no fabricated webhook/job success",async()=>{
  for(const [name,path,body,input] of [
    ["webhooks.list","/api/webhooks",{webhooks:{}},{}],
    ["routines.list","/api/routines",{routines:[],runs:{}},{}],
    ["notifications.list","/api/notifications",{notifications:"no"},{}],
    ["jobs.snapshot","/api/threads/thread1/job",
      {...fixtures["/api/threads/thread1/job"],state:"invented"}, {threadId:"thread1"}],
    ["jobs.snapshot","/api/threads/thread1/job",
      {...fixtures["/api/threads/thread1/job"],threadId:"other"}, {threadId:"thread1"}],
    ["jobs.snapshot","/api/threads/thread1/job",
      {...fixtures["/api/threads/thread1/job"],counts:{failed:0}}, {threadId:"thread1"}],
  ]){
    await assert.rejects(executeEventAutomationRead(config,name,input,
      {fetchImpl:mock([],{[path]:body})}),(e)=>e.code==="MAUSBOT_EVENT_RESPONSE_INVALID",name);
  }
});
const changes=[
  ["webhooks.test",{webhookId:"hook1"},"POST","/api/webhooks/hook1/test",
    {event:"openmaus.test",message:"ATLAS verification only"}],
  ["webhooks.rotate",{webhookId:"hook1"},"POST","/api/webhooks/hook1/rotate",undefined],
  ["webhooks.update",{webhookId:"hook1",enabled:false},"PATCH","/api/webhooks/hook1",{enabled:false}],
  ["webhooks.delete",{webhookId:"hook1"},"DELETE","/api/webhooks/hook1",undefined],
  ["routines.update",{routineId:"routine1",enabled:true},"PATCH","/api/routines/routine1",{enabled:true}],
  ["routines.run",{routineId:"routine1"},"POST","/api/routines/routine1/run",undefined],
  ["notifications.read",{notificationId:"n1"},"POST","/api/notifications/n1/read",undefined],
  ["notifications.read-all",{},"POST","/api/notifications/read-all",undefined],
];
test("Eight guarded plans map exact native routes, methods and review flags",()=>{
  assert.equal(EVENT_AUTOMATION_PLANS.length,8);
  for(const [name,input,method,path,body] of changes){
    const p=planEventAutomationMutation(name,input);
    assert.equal(p.primitive,name);assert.equal(p.method,method);
    assert.equal(p.path,path);assert.deepEqual(p.body,body);
    assert.equal(p.callable,false);assert.equal(p.released,false);
    assert.equal(p.hostTested,false);assert.equal(p.requiresHumanApproval,true);
    assert.equal(p.requiresDurableAudit,true);
    assert.equal(p.requiresResourceOwnership,true);
    assert.equal(p.retryPolicy,"never-automatic");
    assert.equal(nativePrimitive(name).method,method);
  }
  assert.equal(planEventAutomationMutation("webhooks.rotate",{webhookId:"hook1"})
    .mayContainSecretInUpstreamResult,true);
});
test("Mutations reject browser approvals, raw webhook secrets, inbound event URLs and uncontrolled bodies",()=>{
  const invalid=[
    ["webhooks.rotate",{webhookId:"hook1",approved:true}],
    ["webhooks.update",{webhookId:"hook1",enabled:true,verificationPending:false}],
    ["webhooks.test",{webhookId:"hook1",event:"PRIVATE",message:"SENSITIVE"}],
    ["webhooks.delete",{webhookId:"../bad"}],
    ["routines.update",{routineId:"routine1",prompt:"PRIVATE"}],
    ["routines.run",{routineId:"routine1",sendId:"arbitrary"}],
    ["notifications.read",{notificationId:"../../"}],
    ["notifications.read-all",{threadId:"other"}],
    ["webhooks.address",{webhookId:"hook1"}],
    ["webhooks.create",{webhookId:"hook1"}],
  ];
  for(const [name,input] of invalid)
    assert.throws(()=>planEventAutomationMutation(name,input),EventAutomationContractError,name);
});
test("SSE reconnect planning and dedup are offline with replay-gap reconciliation explicit",()=>{
  const fresh=planMausbotEventReplay();
  assert.deepEqual(fresh.headers,{});
  assert.equal(fresh.path,"/api/events");
  assert.equal(fresh.callable,false);
  assert.equal(fresh.requiresDurableCursorStore,true);
  assert.equal(fresh.requiresDedupe,true);
  const resumed=planMausbotEventReplay("c-abc1");
  assert.deepEqual(resumed.headers,{"Last-Event-ID":"c-abc1"});
  for(const bad of ["\n", "c\rabc", "\0", "a".repeat(301), 123])
    assert.throws(()=>planMausbotEventReplay(bad),EventAutomationContractError);
  assert.deepEqual(reconcileMausbotEvent({cursor:"c1"},{kind:"message",cursor:"c1"}),
    {cursor:"c1",requiresResync:false,duplicate:true,accepted:false});
  assert.deepEqual(reconcileMausbotEvent({cursor:"c1"},{kind:"hello",requiresResync:true}),
    {cursor:"c1",requiresResync:true,duplicate:false,accepted:false});
  assert.deepEqual(reconcileMausbotEvent({cursor:"c1"},{kind:"message",cursor:"c2"}),
    {cursor:"c2",requiresResync:false,duplicate:false,accepted:true});
});
