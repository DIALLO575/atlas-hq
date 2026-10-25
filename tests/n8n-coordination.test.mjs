import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { projectN8nCoordination, N8nCoordinationError } from "../packages/engines/n8n/src/coordination.mjs";

const W="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const I="aaaaaaaa-0000-4000-8000-000000000001";
const F="aaaa0000-0000-4000-8000-000000000001";
const M="aaaa0000-0000-4000-8000-000000000010";
const E="aaaa1000-0000-4000-8000-000000000001";
const wf=(id=F,overrides={})=>({
  id,workspace_id:W,instance_id:I,name:"Workflow observé",sync_state:"observed",
  last_seen_at:"2026-10-25T10:30:00.000Z",...overrides,
});
const execRow=(id=E,overrides={})=>({
  id,workspace_id:W,instance_id:I,workflow_id:F,mission_id:M,
  status:"success",started_at:"2026-10-25T10:00:00.000Z",
  stopped_at:"2026-10-25T10:05:00.000Z",
  last_seen_at:"2026-10-25T10:05:00.000Z",...overrides,
});
const project=(workflowRows=[wf()],executionRows=[execRow()],missionId=null)=>projectN8nCoordination({
  workspaceId:W,missionId,workflowRows,executionRows,
});
const blocked=e=>e instanceof N8nCoordinationError;
const read=path=>readFile(new URL(path,import.meta.url),"utf8");

test("one read model projects stored metadata, never claims a live agent or workflow",()=>{
 const view=project();
 assert.equal(view.source,"atlas-registry");
 assert.equal(view.engine,"n8n");
 assert.equal(view.workflowCountShown,1);
 assert.equal(view.executionCountShown,1);
 assert.equal(view.certifiedAgentCount,null);
 assert.equal(view.agentCertification,"not-verified");
 assert.equal(view.canStartWorkflow,false);
 assert.equal(view.canAttachAgent,false);
 assert.equal(view.canApprove,false);
 assert.equal(view.providerConnected,false);
 assert.equal(view.liveSyncEnabled,false);
 assert.equal(view.workflows[0].name,"Workflow observé");
 assert.equal(view.executions[0].workflowName,"Workflow observé");
 assert.equal(view.executions[0].missionId,M);
 assert.equal(view.executions[0].status,"success");
 assert.ok(Object.isFrozen(view)&&Object.isFrozen(view.workflows)&&Object.isFrozen(view.executions));
});

test("autonomous executions are supported without inventing an Atlas mission",()=>{
 const view=project([wf()],[execRow(E,{mission_id:null,status:"waiting"})]);
 assert.equal(view.executions[0].missionId,null);
 assert.equal(view.executions[0].status,"waiting");
 assert.equal(view.canStartWorkflow,false);
});

test("a mission-filtered view accepts only execution rows for that mission",()=>{
 const v=project([wf()],[execRow()],M);
 assert.equal(v.missionId,M);
 assert.equal(v.executions[0].missionId,M);
 assert.throws(()=>project([wf()],[execRow(E,{mission_id:null})],M),blocked);
 assert.throws(()=>project([wf()],[execRow(E,{mission_id:B})],M),blocked);
});

test("cross-tenant workflow and execution rows fail closed, not silently reprojected",()=>{
 for(const row of [
  wf(F,{workspace_id:B}),wf(F,{instance_id:"not-uuid"}),wf(F,{sync_state:"verified"}),
  wf(F,{last_seen_at:"not-a-date"}),
 ]){
  assert.throws(()=>project([row],[]),blocked);
 }
 for(const row of [
  execRow(E,{workspace_id:B}),execRow(E,{mission_id:"https://other.example.org"}),
  execRow(E,{status:"approved"}),execRow(E,{started_at:"tomorrow"}),
 ]){
  assert.throws(()=>project([wf()],[row]),blocked);
 }
});

test("workflow bindings must not cross instances even within same workspace",()=>{
 const foreign="aaaaaaaa-0000-4000-8000-000000000011";
 assert.throws(()=>project([wf()],[execRow(E,{instance_id:foreign})]),blocked);
});

test("list caps are explicit; no global totals inferred from a 51-row extract",()=>{
 const a=Array.from({length:51},(_,i)=>wf("aaaa0000-0000-4000-8000-"+String(i+1).padStart(12,"0")));
 const b=Array.from({length:51},(_,i)=>execRow("aaaa1000-0000-4000-8000-"+String(i+1).padStart(12,"0"),
  {workflow_id:a[0].id,mission_id:null}));
 const v=project(a,b);
 assert.equal(v.workflowCountShown,50);
 assert.equal(v.executionCountShown,50);
 assert.equal(v.workflowListTruncated,true);
 assert.equal(v.executionListTruncated,true);
 assert.equal(v.workflows.length,50);
 assert.equal(v.executions.length,50);
 assert.throws(()=>project([...a,wf(F)],b),blocked);
});

test("duplicate remote metadata rows are rejected for consistency",()=>{
 assert.throws(()=>project([wf(),wf()],[]),blocked);
 assert.throws(()=>project([wf()],[execRow(),execRow()]),blocked);
});

test("no sensitive nodes, remote execution data, tokens, actor or credential projected",()=>{
 const view=project([wf(F,{token:"SECRET_WORKFLOW",nodes:[{key:"SECRET"}],remote_workflow_id:"n8n-secret"})],
  [execRow(E,{output:{secret:"SECRET_EXECUTION"},remote_execution_id:"remote-sensitive"})]);
 const serialized=JSON.stringify(view);
 for(const marker of ["SECRET_WORKFLOW","SECRET_EXECUTION","n8n-secret","remote-sensitive"]){
  assert.equal(serialized.includes(marker),false);
 }
 assert.ok(!Object.hasOwn(view.executions[0],"output"));
 assert.ok(!Object.hasOwn(view.workflows[0],"remote_workflow_id"));
});

test("zero stored rows means zero recorded, NOT zero n8n provider workflows",()=>{
 const result=project([],[]);
 assert.equal(result.workflowCountShown,0);
 assert.equal(result.executionCountShown,0);
 assert.equal(result.providerConnected,false);
 assert.equal(result.provenance,"stored-metadata-only");
});

test("shared BFF authenticates workspace, limits queries and avoids provider calls",async()=>{
 const r=await read("../src/app/api/apps/n8n/coordination/route.ts");
 assert.match(r,/requireEngineWorkspace\(workspaceId\)/);
 assert.ok(r.indexOf("requireEngineWorkspace(workspaceId)") <
  r.indexOf('from("atlas_automation_workflows")'));
 assert.match(r,/\.from\("atlas_automation_workflows"\)/);
 assert.match(r,/\.from\("atlas_automation_executions"\)/);
 assert.match(r,/\.eq\("workspace_id",workspaceId\)/);
 assert.match(r,/\.eq\("mission_id",missionId\)/);
 assert.match(r,/\.limit\(51\)/);
 assert.match(r,/params\.getAll\("workspaceId"\)\.length!==1/);
 assert.match(r,/projectN8nCoordination\(/);
 assert.match(r,/N8N_COORDINATION_REGISTRY_UNAVAILABLE/);
 assert.doesNotMatch(r,/service_role|SUPABASE_SERVICE_ROLE|createN8nMcp|testN8nConnection|n8nRequest|fetch\(/i);
 assert.doesNotMatch(r,/export async function POST|\.insert\(|\.update\(|\.delete\(/);
});

test("Chief and Missions retain n8n while Agents focuses on real MAUSBOT teams",async()=>{
 const [chief,agents,missions,ui]=await Promise.all([
  read("../src/app/chief/page.tsx"),
  read("../src/components/agents-workspace.tsx"),
  read("../src/app/missions/page.tsx"),
  read("../src/components/n8n-coordination-panel.tsx"),
 ]);
 assert.match(chief,/<N8nCoordinationPanel workspaceId=\{data\.selected\.id\} scope="chief"/);
  assert.doesNotMatch(agents,/<N8nCoordinationPanel/);
 assert.match(missions,/<N8nCoordinationPanel workspaceId=\{data\.selected\.id\} scope="missions"/);
 assert.match(missions,/data\.missions\.some\(m => m\.id === params\.missionId\)/);
 assert.match(agents,/listWorkspaces\(\)/);
  assert.match(agents,/atlas-team-grid/);
  assert.match(agents,/atlas-team-member-grid/);
 assert.match(ui,/fetch\("\/api\/apps\/n8n\/coordination\?"/);
 assert.match(ui,/credentials:"same-origin"/);
 assert.match(ui,/controller\.abort\(\)/);
 assert.match(ui,/scope==="agents"/);
 assert.match(ui,/Agent n8n certifié/);
 assert.match(ui,/modèle IA/);
 assert.match(ui,/canStartWorkflow!==false/);
 assert.doesNotMatch(ui,/NEXT_PUBLIC_N8N|ATLAS_N8N_API_KEY|method:\s*"POST"|publish_workflow|tools\/call/);
});

test("no migrations required and Chief stays deterministic (SHA-119 still in backlog)",async()=>{
 const [chiefApi,page,model]=await Promise.all([
  read("../src/app/api/chief/route.ts"),
  read("../src/app/chief/page.tsx"),
  read("../packages/engines/n8n/src/coordination.mjs"),
 ]);
 assert.match(chiefApi,/buildChiefReply\(/);
 assert.match(page,/buildChiefReply\(initialPrompt/);
 assert.doesNotMatch(model,/\bfetch\s*\(|service_role|process\.env|createClient|insert\(|update\(/);
});
