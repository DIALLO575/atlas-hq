import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { n8nReleaseState, n8nReleasePermission, mausbotReleasePermission } from "../packages/engine-core/src/release-gates.mjs";
import { resolveN8nReadOnlyConfig } from "../packages/engines/n8n/src/adapter.mjs";
import { createN8nRuntimePreflight, N8nPreflightError } from "../packages/engines/n8n/src/runtime-preflight.mjs";

const W="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const I="aaaaaaaa-0000-4000-8000-000000000001";
const F="aaaa0000-0000-4000-8000-000000000001";
const A="11111111-1111-4111-8111-111111111111";
const S="11111111-2222-4111-8111-111111111111";
const K="22222222-2222-4222-8222-222222222222";
const D="a".repeat(64);
const error=code=>e=>e instanceof N8nPreflightError && e.code===code && !JSON.stringify(e).includes("token");
const read=(p)=>readFile(new URL(p,import.meta.url),"utf8");
function harness(overrides={}){
  const log=[];
  const state={
    role:"owner",active:true,grant:true,instance:{id:I,workspace_id:W,engine_key:"n8n",connection_state:"offline",version:1},
    workflow:{id:F,workspace_id:W,instance_id:I,remote_workflow_id:"n8n_remote_1",sync_state:"observed",remote_active:true},
    ...overrides,
  };
  const authenticate=async session=>{
    log.push("authenticate");
    if(session!=="opaque-session") throw Error("PRIVATE_AUTH_FAILURE token");
    return {verified:true,actorId:A,sessionId:S};
  };
  const repository={transaction:async callback=>{
    log.push("tx");
    return callback({
      sessionActive:async(a,s)=>{log.push("session");return state.active && a===A && s===S;},
      workspaceRole:async()=>{log.push("role");return state.role;},
      getInstanceForScope:async()=>{log.push("instance");return state.instance;},
      getWorkflowForScope:async()=>{log.push("workflow");return state.workflow;},
      capabilityGrant:async()=>{log.push("grant");return state.grant;},
    });
  }};
  return {preflight:createN8nRuntimePreflight({authenticate,repository}),log,state};
}
const input=(capability="workflows.get",other={})=>({
 scope:{workspaceId:W,instanceId:I,workflowId:F},session:"opaque-session",capability,...other,
});
const executable=()=>input("workflows.invoke",{intentDigest:D,idempotencyKey:K});

test("n8n live I/O release gate cannot be enabled by arbitrary env and MAUSBOT still blocks mutations",()=>{
 for(const env of [{},{ATLAS_N8N_RELEASE_STAGE:"enabled",ATLAS_N8N_FORCE_EXECUTE:"true",ATLAS_ENGINE_RELEASE:"prod"},
   {ATLAS_MAUSBOT_RELEASE_STAGE:"enabled"}]){
  const state=n8nReleaseState(env);
  assert.deepEqual({stage:state.stage,providerReadsEnabled:state.providerReadsEnabled,
    mutationsEnabled:state.mutationsEnabled,dispatchEnabled:state.dispatchEnabled},
    {stage:"offline",providerReadsEnabled:false,mutationsEnabled:false,dispatchEnabled:false});
  for(const mode of ["read","write","execute"]){
   const permission=n8nReleasePermission(env,mode);
   assert.deepEqual(permission,{allowed:false,status:423,code:"N8N_DURABLE_RELEASE_GATE_CLOSED"});
  }
 }
 assert.equal(n8nReleasePermission({},"foo").status,400);
 assert.equal(mausbotReleasePermission({ATLAS_MAUSBOT_RELEASE_STAGE:"enabled"},"execute").allowed,false);
});

test("preflight requires trusted server authentication plus transactional repository, no open defaults",()=>{
 for(const invalid of [{},{authenticate:async()=>({verified:true,actorId:A,sessionId:S})},
   {authenticate:"truthy",repository:{transaction:async()=>{}}}]){
  assert.throws(()=>createN8nRuntimePreflight(invalid),error("N8N_PREFLIGHT_DEPENDENCIES_INVALID"));
 }
 const h=harness();
 await assert.rejects(h.preflight.inspect(input("workflows.get",{approved:true})),error("N8N_PREFLIGHT_INPUT_INVALID"));
 await assert.rejects(h.preflight.inspect({...input(),role:"owner"}),error("N8N_PREFLIGHT_INPUT_INVALID"));
 await assert.rejects(h.preflight.inspect({...input(),session:"forged"}),error("N8N_PREFLIGHT_AUTH_REQUIRED"));
 assert.deepEqual(h.log,["authenticate"]);
});

test("authorized metadata preflight is scoped and STILL denies dispatch",async()=>{
 const h=harness();
 const result=await h.preflight.inspect(input());
 assert.equal(result.kind,"n8n-preflight-inspection");
 assert.equal(result.capability,"workflows.get");
 assert.equal(result.transport,"rest");
 assert.equal(result.providerGrantChecked,true);
 assert.equal(result.canEnqueue,false);
 assert.equal(result.canDispatch,false);
 assert.equal(result.providerIoEnabled,false);
 assert.equal(result.requiresEgressCertification,true);
 assert.equal(result.requiresReleaseMigration,true);
 assert.equal(result.releaseCode,"N8N_DURABLE_RELEASE_GATE_CLOSED");
 assert.equal(JSON.stringify(result).includes(S),false);
 assert.equal(JSON.stringify(result).includes(A),false);
 assert.equal(JSON.stringify(result).includes("n8n_remote_1"),false);
 assert.equal(Object.isFrozen(result),true);
 assert.deepEqual(h.log,["authenticate","tx","session","role","instance","workflow","grant"]);
});

test("even a fully granted owner cannot enqueue a webhook, reuse intent or call n8n",async()=>{
 const h=harness();
 const call1=await h.preflight.inspect(executable());
 const call2=await h.preflight.inspect(executable());
 for(const call of [call1,call2]){
   assert.equal(call.mode,"execute");
   assert.equal(call.transport,"webhook");
   assert.equal(call.requiresHumanApproval,true);
   assert.equal(call.requiresDurableIdempotency,true);
   assert.equal(call.requiresTrustedWorker,true);
   assert.equal(call.canEnqueue,false);
   assert.equal(call.canDispatch,false);
 }
 assert.equal(h.log.filter(x=>x==="grant").length,2);
 // This duplicate is NOT persisted/deduplicated: there is no outbox writer.
 assert.equal(h.log.includes("dispatch"),false);
});

test("read operations refuse mutation fingerprints; writes require digest and key",async()=>{
 const h=harness();
 await assert.rejects(h.preflight.inspect(input("workflows.get",{intentDigest:D})),error("N8N_PREFLIGHT_INTENT_UNEXPECTED"));
 await assert.rejects(h.preflight.inspect(input("workflows.get",{idempotencyKey:K})),error("N8N_PREFLIGHT_INTENT_UNEXPECTED"));
 await assert.rejects(h.preflight.inspect(input("workflows.invoke")),error("N8N_PREFLIGHT_INTENT_REQUIRED"));
 await assert.rejects(h.preflight.inspect(input("workflows.invoke",{intentDigest:"approved",idempotencyKey:K})),error("N8N_PREFLIGHT_INTENT_REQUIRED"));
 await assert.rejects(h.preflight.inspect(input("workflows.invoke",{intentDigest:D,idempotencyKey:"not-uuid"})),error("N8N_PREFLIGHT_INTENT_REQUIRED"));
});

test("authentication revocation and workspace roles are checked before instance and provider grants",async()=>{
 for(const [changes,code] of [
  [{active:false},"N8N_PREFLIGHT_SESSION_REVOKED"],
  [{role:null},"N8N_PREFLIGHT_WORKSPACE_FORBIDDEN"],
 ]){
  const h=harness(changes);
  await assert.rejects(h.preflight.inspect(input()),error(code));
  assert.equal(h.log.includes("instance"),false);
  assert.equal(h.log.includes("grant"),false);
 }
 const member=harness({role:"member"});
 await member.preflight.inspect(input());
 await assert.rejects(member.preflight.inspect(executable()),error("N8N_PREFLIGHT_ADMIN_REQUIRED"));
 assert.equal(member.log.filter(x=>x==="grant").length,1);
});

test("cross-workspace, non-n8n provider, activated instance and invalid versions are forbidden",async()=>{
 const cases=[
  [{instance:{id:I,workspace_id:"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",engine_key:"n8n",connection_state:"offline",version:1}},"N8N_PREFLIGHT_INSTANCE_UNAVAILABLE"],
  [{instance:{id:I,workspace_id:W,engine_key:"mausbot",connection_state:"offline",version:1}},"N8N_PREFLIGHT_INSTANCE_UNAVAILABLE"],
  [{instance:{id:I,workspace_id:W,engine_key:"n8n",connection_state:"connected",version:1}},"N8N_PREFLIGHT_INSTANCE_UNAVAILABLE"],
  [{instance:{id:I,workspace_id:W,engine_key:"n8n",connection_state:"offline",version:0}},"N8N_PREFLIGHT_INSTANCE_UNAVAILABLE"],
 ];
 for(const [changes,code] of cases){
  const h=harness(changes);
  await assert.rejects(h.preflight.inspect(input()),error(code));
  assert.equal(h.log.includes("grant"),false);
 }
 const h=harness();
 await assert.rejects(h.preflight.inspect({...input(),scope:{workspaceId:"bad",instanceId:I,workflowId:F}}),error("N8N_PREFLIGHT_SCOPE_INVALID"));
 await assert.rejects(h.preflight.inspect({...input(),scope:{workspaceId:W,instanceId:I,workflowId:"../escape"}}),error("N8N_PREFLIGHT_SCOPE_INVALID"));
});

test("workflow reference must be Atlas-owned; stale, disabled, missing cannot be executed",async()=>{
 const others=[
  {id:F,workspace_id:"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",instance_id:I,remote_workflow_id:"r",sync_state:"observed",remote_active:true},
  {id:F,workspace_id:W,instance_id:"bbbbbbbb-0000-4000-8000-000000000001",remote_workflow_id:"r",sync_state:"observed",remote_active:true},
  {id:F,workspace_id:W,instance_id:I,remote_workflow_id:"../../admin",sync_state:"observed",remote_active:true},
 ];
 for(const flow of others)await assert.rejects(harness({workflow:flow}).preflight.inspect(input()),error("N8N_PREFLIGHT_WORKFLOW_FORBIDDEN"));
 for(const [sync_state,remote_active] of [["unverified",true],["missing",true],["observed",false]]){
  const h=harness({workflow:{id:F,workspace_id:W,instance_id:I,remote_workflow_id:"wf",sync_state,remote_active}});
  await assert.rejects(h.preflight.inspect(executable()),error("N8N_PREFLIGHT_WORKFLOW_NOT_VERIFIED"));
 }
});

test("absent provider grant fails for read and execute, no release from declared capability",async()=>{
 for(const capability of ["workflows.get","workflows.invoke"]){
  const h=harness({grant:false});
  await assert.rejects(h.preflight.inspect(capability==="workflows.get"?input():executable()),error("N8N_PREFLIGHT_GRANT_FORBIDDEN"));
 }
 await assert.rejects(harness().preflight.inspect(input("forged.execute")),error("N8N_PREFLIGHT_CAPABILITY_INVALID"));
});

test("instance-scoped capabilities do not accept a forged workflow or execution selector",async()=>{
 const h=harness();
 await assert.rejects(h.preflight.inspect(input("workflows.list")),error("N8N_PREFLIGHT_SCOPE_INVALID"));
 const result=await h.preflight.inspect({scope:{workspaceId:W,instanceId:I},capability:"workflows.list",session:"opaque-session"});
 assert.equal(result.workflowId,null);
 assert.equal(result.canDispatch,false);
 await assert.rejects(h.preflight.inspect(input("executions.get")),error("N8N_PREFLIGHT_EXECUTION_INVALID"));
 const detail=await h.preflight.inspect(input("executions.get",{executionId:"132"}));
 assert.equal(detail.transport,"rest");
 assert.equal(detail.canDispatch,false);
});

test("storage failures, broken adapter, provider errors sanitize and refuse",async()=>{
 const h=harness();
 h.state.grant=null;
 await assert.rejects(h.preflight.inspect(input()),error("N8N_PREFLIGHT_GRANT_FORBIDDEN"));
 const broken=createN8nRuntimePreflight({
  authenticate:async()=>({verified:true,actorId:A,sessionId:S}),
  repository:{transaction:async()=>{throw Error("SECRET_DATABASE_CONNECTION_STRING");}},
 });
 await assert.rejects(broken.inspect(input()),error("N8N_PREFLIGHT_STORAGE_UNAVAILABLE"));
});

test("server config does not serialize its API credential and still supports private API use",()=>{
 const env={
  ATLAS_N8N_WORKSPACE_ID:W,ATLAS_N8N_BASE_URL:"https://atlas-n8n.example.org/",
  ATLAS_N8N_ALLOWED_HOST:"atlas-n8n.example.org",
  ATLAS_N8N_API_KEY:["sandbox","fixture","do","not","deploy","0123456789"].join("-"),
 };
 const cfg=resolveN8nReadOnlyConfig(env,W);
 assert.ok(cfg);
 assert.equal(cfg.apiKey,env.ATLAS_N8N_API_KEY);
 assert.equal(JSON.stringify(cfg).includes(env.ATLAS_N8N_API_KEY),false);
 assert.equal(JSON.stringify({...cfg}).includes(env.ATLAS_N8N_API_KEY),false);
 assert.equal(Object.keys(cfg).includes("apiKey"),false);
 assert.equal(Object.isFrozen(cfg),true);
});

test("no n8n network endpoint, worker fork, client elevation or permission flag added",async()=>{
 const [source,gates,sql]=await Promise.all([
  read("../packages/engines/n8n/src/runtime-preflight.mjs"),
  read("../packages/engine-core/src/release-gates.mjs"),
  read("../supabase/migrations/20261025130000_atlas_n8n_runtime_offline_gate.sql"),
 ]);
 assert.doesNotMatch(source,/\b(fetch|axios|exec|spawn|service_role|NEXT_PUBLIC|setInterval)\s*\(/);
 assert.doesNotMatch(source,/from\s+["'][^"']*outbox-worker/);
 assert.match(gates,/N8N_DURABLE_RELEASE_GATE_CLOSED/);
 assert.match(sql,/engine_key <> 'n8n' or connection_state='offline'/);
 assert.doesNotMatch(sql,/\bdrop\b|\bdelete\b|\btruncate\b/i);
});
