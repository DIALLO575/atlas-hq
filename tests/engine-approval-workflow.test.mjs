import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createEngineApprovalWorkflow,engineApprovalIntentDigest,EngineApprovalError }
 from "../packages/engine-core/src/approval-workflow.mjs";
const W="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const INST="aaaaaaaa-0000-4000-8000-000000000001";
const RUN="aaaaaaa1-0000-4000-8000-000000000001";
const MISSION="eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const REQUESTER="11111111-1111-4111-8111-111111111111";
const REVIEWER="33333333-3333-4333-8333-333333333333";
const OUTSIDER="22222222-2222-4222-8222-222222222222";
const SCOPE={workspaceId:W,instanceId:INST,runId:RUN};
const N=Date.parse("2026-10-24T18:00:00Z");
const run=()=>({id:RUN,workspace_id:W,instance_id:INST,mission_id:MISSION,
 requested_by:REQUESTER,primitive_id:"jobs.interrupt",payload_sha256:"a".repeat(64),state:"draft"});
const request=session=>({scope:SCOPE,session});
const approve=(session,expectedIntentDigest,decision="approved")=>({...request(session),decision,expectedIntentDigest});
function fake({clock=N,revoked=false,brokenAudit=false,roleOverrides={},
  runOverride={},storageError=false}={}){
 const state={run:{...run(),...runOverride},approval:null,audits:[],txCount:0,revoked,clock};
 const roles={[REQUESTER]:"member",[REVIEWER]:"admin",[OUTSIDER]:null,...roleOverrides};
 const sessions={requester:REQUESTER,reviewer:REVIEWER,outsider:OUTSIDER};
 const api=createEngineApprovalWorkflow({
  authenticate:async session=>{
    const actorId=sessions[session];
    if(!actorId)return null;
    return {verified:true,actorId,sessionId:"dddddddd-dddd-4ddd-8ddd-dddddddddddd"};
  },
  now:()=>state.clock,
  repository:{async transaction(fn){
    state.txCount++;
    const draft=state.approval?{...state.approval}:null;
    let pending=draft,history=[...state.audits];
    const tx={
      async sessionActive(actorId){return !state.revoked&&Object.values(sessions).includes(actorId);},
      async workspaceRole(workspaceId,actorId){return workspaceId===W?roles[actorId]??null:null;},
      async getRunForUpdate(){return state.run;},
      async getApprovalForUpdate(){return pending;},
      async insertPending(p){
        if(storageError)throw new Error("SQL details: secret");
        if(pending!==null)throw new Error("UNIQUE");
        pending={...p,decided_by:null,decided_at:null};
      },
      async decidePending(d){
        if(storageError)throw new Error("SQL details: secret");
        if(!pending||pending.decision!=="pending"||pending.intent_digest!==d.intentDigest)return false;
        pending={...pending,decision:d.decision,decided_by:d.reviewerId,decided_at:d.decidedAt};
        return true;
      },
      async audit(a){
        if(brokenAudit)throw new Error("AUDIT_SQL_PRIVATE");
        history.push(a);
      },
    };
    const result=await fn(tx);
    state.approval=pending;
    state.audits=history;
    return result;
  }}
 });
 return {api,state};
}
test("Requester establishes a pending decision strictly bound to immutable run scope and digest",async()=>{
 const {api,state}=fake();
 const r=await api.request(request("requester"));
 assert.equal(r.state,"pending");
 assert.equal(r.canDispatch,false);
 assert.match(r.intentDigest,/^[a-f0-9]{64}$/);
 assert.equal(r.expiresAt,"2026-10-24T18:15:00.000Z");
 assert.equal(r.intentDigest,engineApprovalIntentDigest(state.run));
 assert.deepEqual(state.audits.map(x=>x.event_key),["engine.approval.requested"]);
 assert.equal(JSON.stringify(state.approval).includes("rawPrompt"),false);
 await assert.rejects(api.request(request("requester")),e=>e.code==="APPROVAL_ALREADY_EXISTS");
});
test("Independent admin approves exact digest once, without starting engine",async()=>{
 const {api,state}=fake();
 const {intentDigest}=await api.request(request("requester"));
 const approved=await api.decide(approve("reviewer",intentDigest));
 assert.deepEqual(approved,{decision:"approved",intentDigest,canDispatch:false});
 assert.equal(state.approval.decision,"approved");
 assert.equal(state.approval.decided_by,REVIEWER);
 assert.deepEqual(state.audits.map(x=>x.event_key),
 ["engine.approval.requested","engine.approval.approved"]);
 const view=await api.inspect(request("requester"));
 assert.equal(view.decision,"approved");
 assert.equal(view.canDispatch,false);
 await assert.rejects(api.decide(approve("reviewer",intentDigest)),e=>e.code==="APPROVAL_ALREADY_DECIDED");
});
test("Rejection also produces immutable audit and cannot be flipped",async()=>{
 const {api,state}=fake();
 const {intentDigest}=await api.request(request("requester"));
 const answer=await api.decide(approve("reviewer",intentDigest,"rejected"));
 assert.equal(answer.decision,"rejected");
 assert.equal(state.audits.at(-1).event_key,"engine.approval.rejected");
 await assert.rejects(api.decide(approve("reviewer",intentDigest,"approved")),
 e=>e.code==="APPROVAL_ALREADY_DECIDED");
});
test("Self-approval, outsider and member reviewer are all forbidden",async()=>{
 const state=fake();
 const {intentDigest}=await state.api.request(request("requester"));
 for(const actor of ["requester","outsider"]){
   await assert.rejects(state.api.decide(approve(actor,intentDigest)),
   e=>e instanceof EngineApprovalError);
 }
 const limited=fake({roleOverrides:{[REVIEWER]:"member"}});
 const {intentDigest:d}=await limited.api.request(request("requester"));
 await assert.rejects(limited.api.decide(approve("reviewer",d)),
 e=>e.code==="APPROVAL_REVIEWER_FORBIDDEN");
 assert.equal(state.state.approval.decision,"pending");
});
test("Session revocation prevents request, approval and viewing even if JWT was previously verified",async()=>{
 const state=fake();
 const {intentDigest}=await state.api.request(request("requester"));
 state.state.revoked=true;
 for(const cmd of [
  ()=>state.api.decide(approve("reviewer",intentDigest)),
  ()=>state.api.inspect(request("reviewer")),
  ()=>state.api.request(request("requester")),
 ])await assert.rejects(cmd(),e=>e.code==="APPROVAL_SESSION_REVOKED");
});
test("Stale digest, altered payload or wrong mission cannot be silently approved",async()=>{
 const x=fake();
 const {intentDigest}=await x.api.request(request("requester"));
 await assert.rejects(x.api.decide(approve("reviewer","b".repeat(64))),
   e=>e.code==="APPROVAL_INTENT_CHANGED");
 x.state.run.payload_sha256="c".repeat(64);
 await assert.rejects(x.api.decide(approve("reviewer",intentDigest)),
   e=>e.code==="APPROVAL_RECORD_MISMATCH");
 x.state.run.payload_sha256="a".repeat(64);
 x.state.run.mission_id="bbbbbbbb-0000-4000-8000-000000000002";
 await assert.rejects(x.api.decide(approve("reviewer",intentDigest)),
   e=>e.code==="APPROVAL_RECORD_MISMATCH");
 assert.equal(x.state.approval.decision,"pending");
});
test("Expired review windows are rejected, including boundary timestamp",async()=>{
 const x=fake();
 const {intentDigest}=await x.api.request(request("requester"));
 x.state.clock=N+15*60*1000;
 await assert.rejects(x.api.decide(approve("reviewer",intentDigest)),
 e=>e.code==="APPROVAL_EXPIRED");
 x.state.clock=N+15*60*1000+1;
 await assert.rejects(x.api.decide(approve("reviewer",intentDigest)),
 e=>e.code==="APPROVAL_EXPIRED");
});
test("Tampered scope and user-supplied permission flags rejected before any write",async()=>{
 const x=fake();
 const invalid=[
  {...request("requester"),approved:true},
  {...request("requester"),scope:{...SCOPE,workspaceId:B}},
  {...request("requester"),scope:{...SCOPE,requestedBy:REQUESTER}},
  {...request("requester"),session:null},
 ];
 for(const input of invalid)await assert.rejects(x.api.request(input),EngineApprovalError);
 await assert.rejects(x.api.decide({...approve("reviewer","a".repeat(64)),allowSelfApproval:true}),
 e=>e.code==="APPROVAL_INPUT_INVALID");
 assert.equal(x.state.approval,null);
});
test("Audit error or transaction error rolls back approval, never exposes SQL internals",async()=>{
 const x=fake({brokenAudit:true});
 await assert.rejects(x.api.request(request("requester")),
 e=>e.code==="APPROVAL_STORAGE_UNAVAILABLE"&&!e.message.includes("SQL"));
 assert.equal(x.state.approval,null);
 const y=fake();
 const {intentDigest}=await y.api.request(request("requester"));
 y.state.audits.push({event_key:"unrelated"});
 const z=fake({storageError:true});
 await assert.rejects(z.api.request(request("requester")),
 e=>e.code==="APPROVAL_STORAGE_UNAVAILABLE");
 assert.equal(z.state.approval,null);
 assert.equal(y.state.approval.decision,"pending");
 assert.ok(intentDigest);
});
test("Derived digest cannot be reused for a different primitive or workspace",()=>{
 const a=run();
 const digest=engineApprovalIntentDigest(a);
 for(const change of [
  {primitive_id:"agents.delete"},
  {instance_id:"bbbbbbbb-0000-4000-8000-000000000002"},
  {workspace_id:B},
  {payload_sha256:"b".repeat(64)},
  {requested_by:REVIEWER},
 ]) {
  const other={...a,...change};
  if(Object.keys(change).includes("requested_by"))assert.equal(engineApprovalIntentDigest(other),digest);
  else assert.notEqual(engineApprovalIntentDigest(other),digest);
 }
});
