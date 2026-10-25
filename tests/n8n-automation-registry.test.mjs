import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { planN8nWorkflowSync } from "../packages/engines/n8n/src/sync-planner.mjs";

const file = path => readFile(new URL(path, import.meta.url),"utf8");
const W = "123e4567-e89b-42d3-a456-426614174000";
const I = "123e4567-e89b-42d3-a456-426614174001";
const flow = (id="w1") => ({id,name:"My workflow",active:false,createdAt:null,updatedAt:"2026-10-25T11:00:00Z"});
test("offline n8n read model returns only a safe, non-persistable draft",()=>{
 const draft=planN8nWorkflowSync({workspaceId:W,instanceId:I,workflows:[flow()]});
 assert.deepEqual({canPersist:draft.canPersist,canMarkMissing:draft.canMarkMissing,canDispatch:draft.canDispatch},{canPersist:false,canMarkMissing:false,canDispatch:false});
 assert.equal(draft.requiresTrustedServerSnapshot,true);
 assert.equal(draft.requiresCompleteCursorWalkForMissing,true);
 assert.ok(Object.isFrozen(draft));
 assert.ok(Object.isFrozen(draft.rows));
 assert.ok(Object.isFrozen(draft.rows[0]));
 assert.deepEqual(draft.rows[0], {
  workspace_id:W,instance_id:I,remote_workflow_id:"w1",name:"My workflow",
  remote_active:false,remote_created_at:null,remote_updated_at:"2026-10-25T11:00:00Z",
  sync_state:"unverified"
 });
});
test("empty or partial pages never lead to remote deletion",()=>{
 const p=planN8nWorkflowSync({workspaceId:W,instanceId:I,workflows:[]});
 assert.deepEqual(p.rows,[]);
 assert.equal(p.canMarkMissing,false);
});
test("strict scope and identity refuse opaque URLs and invalid multi-tenancy",()=>{
 for(const obj of [{workspaceId:"bad",instanceId:I,workflows:[]},{workspaceId:W,instanceId:"https://example.com",workflows:[]}]){
  assert.throws(()=>planN8nWorkflowSync(obj));
 }
 for(const id of ["../admin","a/b","a?key=1","", "x".repeat(129)]){
  assert.throws(()=>planN8nWorkflowSync({workspaceId:W,instanceId:I,workflows:[flow(id)]}));
 }
});
test("no user token, permissions, data or secret may be submitted to sync draft",()=>{
 const args={workspaceId:W,instanceId:I,workflows:[flow()]};
 for(const key of ["token","url","approved","state","actor","clientGrant","apiKey","completeSnapshot","allowDeletion"])
  assert.throws(()=>planN8nWorkflowSync({...args,[key]:true}));
 for(const key of ["nodes","credentials","parameters","data","secret","executionPayload","token"]){
  assert.throws(()=>planN8nWorkflowSync({...args,workflows:[{...flow(),[key]:"secret"}]}));
 }
});
test("oversized pages, duplicate remote ids, invalid names and timestamps are refused",()=>{
 assert.throws(()=>planN8nWorkflowSync({workspaceId:W,instanceId:I,workflows:Array(101).fill(flow())}));
 assert.throws(()=>planN8nWorkflowSync({workspaceId:W,instanceId:I,workflows:[flow(),flow()]}));
 assert.throws(()=>planN8nWorkflowSync({workspaceId:W,instanceId:I,workflows:[{...flow(),name:"   "}]}));
 assert.throws(()=>planN8nWorkflowSync({workspaceId:W,instanceId:I,workflows:[{...flow(),active:"yes"}]}));
 assert.throws(()=>planN8nWorkflowSync({workspaceId:W,instanceId:I,workflows:[{...flow(),updatedAt:"tomorrow"}]}));
});
test("Atlas BFF workflow listing rechecks membership and instance scope before RLS lookup",async()=>{
 const src=await file("../src/app/api/apps/n8n/workflows/route.ts");
 assert.match(src,/requireEngineWorkspace\(workspaceId\)/);
 assert.ok(src.indexOf("requireEngineWorkspace(workspaceId)") < src.indexOf('.from("atlas_automation_workflows")'));
 assert.match(src,/\.eq\("workspace_id", workspaceId\)\.eq\("engine_key", "n8n"\)/);
 assert.match(src,/\.eq\("id", instanceId\)\.maybeSingle\(\)/);
 assert.match(src,/\.eq\("workspace_id", workspaceId\)/);
 assert.match(src,/\.limit\(50\)/);
 assert.match(src,/N8N_INSTANCE_NOT_FOUND/);
 assert.match(src,/providerConnected: false/);
 assert.match(src,/liveSyncEnabled: false/);
 assert.doesNotMatch(src,/service_role|SUPABASE_SERVICE_ROLE|executeN8n|testN8nConnection|listN8nWorkflows|fetch\(/i);
 assert.doesNotMatch(src,/export async function POST/);
});
test("PR04 SQL schema is metadata only and disallows client writes",async()=>{
 const sql=await file("../supabase/migrations/20261025114449_atlas_n8n_automation_registry.sql");
 assert.match(sql,/create table public\.atlas_automation_workflows/);
 assert.match(sql,/create table public\.atlas_automation_executions/);
 assert.match(sql,/foreign key\(workspace_id,instance_id,engine_key\)/);
 assert.match(sql,/foreign key\(workspace_id,instance_id,workflow_id\)/);
 assert.match(sql,/foreign key\(mission_id,workspace_id\)/);
 assert.match(sql,/create policy atlas_automation_workflows_read/);
 assert.match(sql,/create policy atlas_automation_executions_read/);
 assert.match(sql,/revoke all on table public\.atlas_automation_workflows from public,anon,authenticated/);
 assert.match(sql,/grant select on table public\.atlas_automation_workflows to authenticated/);
 assert.doesNotMatch(sql,/grant (insert|update|delete).*authenticated/i);
 assert.doesNotMatch(sql,/\b(drop table|truncate|delete from|alter table public\.atlas_engine_runs)\b/i);
});
