import assert from "node:assert/strict";
import test from "node:test";
import { createGitHubStudioOperationStore } from "../packages/connectors/github/src/github-studio-store.mjs";
const workspaceId="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const actorId="11111111-1111-4111-8111-111111111111";
const idempotencyKey="10000000-0000-4000-8000-000000000001";
const operationId="10000000-0000-4000-8000-000000000020";
const intent={workspaceId,actorId,idempotencyKey,installationId:77,
 action:"repository.create",digest:"a".repeat(64),draft:{name:"studio-test",private:true}};
test("store adapter calls the exact server-only reserve RPC and refuses unknown output",async()=>{
 const calls=[];
 const store=createGitHubStudioOperationStore({rpc:async(name,params)=>{
   calls.push([name,params]);
   return {data:[{operation_id:operationId,operation_state:"prepared",already_exists:false}],error:null};
 }});
 assert.deepEqual(await store.reserve(intent),{operationId,state:"prepared",alreadyExists:false});
 assert.deepEqual(calls,[["atlas_gh_studio_reserve",{
  p_workspace_id:workspaceId,p_actor_id:actorId,p_installation_id:77,
  p_idempotency_key:idempotencyKey,p_repository_name:"studio-test",
  p_visibility:"private",p_digest:"a".repeat(64)
 }]]);
 const broken=createGitHubStudioOperationStore({rpc:async()=>({data:[],error:null})});
 await assert.rejects(broken.reserve(intent),(e)=>e.code==="STORAGE_UNAVAILABLE");
});
test("advance and finalizer call only the verified SQL function names",async()=>{
 const calls=[];
 const store=createGitHubStudioOperationStore({rpc:async(name,params)=>{
  calls.push({name,params});
  return {data:name==="atlas_gh_studio_finalize_repository"?true:"provider_confirmed",error:null};
 }});
 assert.equal(await store.advance(operationId,"dispatching","provider_confirmed",91),
  "provider_confirmed");
 assert.equal(await store.finishWithAccess(operationId,{repositoryId:91}),true);
 assert.deepEqual(calls.map(x=>x.name),
 ["atlas_gh_studio_advance","atlas_gh_studio_finalize_repository"]);
 assert.equal(calls[1].params.p_repository_id,91);
});
test("storage failures are safe and do not expose raw SQL or credentials",async()=>{
 const store=createGitHubStudioOperationStore({
  rpc:async()=>({data:null,error:{message:"private database token fixture"}})
 });
 await assert.rejects(store.advance(operationId,"prepared","dispatching"),e=>
  e.code==="STORAGE_UNAVAILABLE"&&!e.message.includes("token"));
 await assert.rejects(store.finishWithAccess(operationId,{repositoryId:91}),e=>
  e.code==="STORAGE_UNAVAILABLE");
});
test("invalid identity, spoofed SQL IDs, invalid provider IDs never dispatch",async()=>{
 let calls=0;
 const store=createGitHubStudioOperationStore({rpc:async()=>{calls++;return {data:null}}});
 for(const bad of [
  {...intent,workspaceId:"other"},{...intent,installationId:-1},
  {...intent,draft:{private:true}}, {...intent,action:"repo.delete"},
 ]) await assert.rejects(store.reserve(bad),(e)=>e.code==="INVALID_INPUT");
 await assert.rejects(store.finishWithAccess(operationId,{repositoryId:-1}),
 (e)=>e.code==="INVALID_INPUT");
 assert.equal(calls,0);
});
