/**
 * SHA-180: safe read-model projection for Chief, Agents & Missions.
 * Rows MUST come from the authenticated, RLS-backed Atlas Supabase queries.
 * A stored n8n workflow is NOT a verified AI agent or live n8n connection.
 * No network I/O, model invocation, worker, dispatch or provider secrets.
 */
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[a-f0-9]{12}$/i;
const STATUSES=new Set(["unknown","new","running","waiting","success","error","canceled"]);
const SYNC=new Set(["unverified","observed","missing"]);
const record=x=>x!==null && typeof x==="object" && !Array.isArray(x);
export class N8nCoordinationError extends Error {
  constructor(code){super(code);this.name="N8nCoordinationError";this.code=code;this.status=503;}
}
const fail=code=>{throw new N8nCoordinationError(code);};
const at=(str,max)=>typeof str==="string" && str.length>0 && str.length<=max;
const stamp=x=>x===null||(typeof x==="string"&&x.length<=40&&Number.isFinite(Date.parse(x)));
export function projectN8nCoordination({workspaceId,missionId=null,workflowRows,executionRows}={}){
  if(!UUID.test(workspaceId??"")||(missionId!==null&&!UUID.test(missionId))||
      !Array.isArray(workflowRows)||!Array.isArray(executionRows)||
      workflowRows.length>51||executionRows.length>51)
    fail("N8N_COORDINATION_SCOPE_INVALID");
  const allowedWorkflow=new Map();
  for(const r of workflowRows){
    if(!record(r)||r.workspace_id!==workspaceId||!UUID.test(r.id??"")||
      !UUID.test(r.instance_id??"")||!at(r.name,160)||
      !SYNC.has(r.sync_state)||!stamp(r.last_seen_at))
      fail("N8N_COORDINATION_WORKFLOW_INVALID");
    if(allowedWorkflow.has(r.id))fail("N8N_COORDINATION_DUPLICATE_WORKFLOW");
    allowedWorkflow.set(r.id,Object.freeze({
      id:r.id,instanceId:r.instance_id,name:r.name,syncState:r.sync_state,
      lastSeenAt:r.last_seen_at,
    }));
  }
  const recorded=new Set();
  const executions=[];
  for(const r of executionRows){
    if(!record(r)||r.workspace_id!==workspaceId||!UUID.test(r.id??"")||
      !UUID.test(r.instance_id??"")||!UUID.test(r.workflow_id??"")||
      (r.mission_id!==null&&!UUID.test(r.mission_id))||
      !STATUSES.has(r.status)||!stamp(r.started_at)||!stamp(r.stopped_at)||
      !stamp(r.last_seen_at))
      fail("N8N_COORDINATION_EXECUTION_INVALID");
    if(missionId!==null&&r.mission_id!==missionId)
      fail("N8N_COORDINATION_MISSION_SCOPE_MISMATCH");
    if(recorded.has(r.id))fail("N8N_COORDINATION_DUPLICATE_EXECUTION");
    recorded.add(r.id);
    const workflow=allowedWorkflow.get(r.workflow_id);
    if(workflow&&workflow.instanceId!==r.instance_id)
      fail("N8N_COORDINATION_INSTANCE_MISMATCH");
    executions.push(Object.freeze({
      id:r.id,workflowId:r.workflow_id,missionId:r.mission_id,
      workflowName:workflow?.name??null,status:r.status,
      startedAt:r.started_at,stoppedAt:r.stopped_at,lastSeenAt:r.last_seen_at,
    }));
  }
  const workflows=Object.freeze([...allowedWorkflow.values()].slice(0,50));
  const visible=Object.freeze(executions.slice(0,50));
  return Object.freeze({
    source:"atlas-registry",engine:"n8n",workspaceId,
    missionId,workflowCountShown:workflows.length,executionCountShown:visible.length,
    workflowListTruncated:workflowRows.length>50,
    executionListTruncated:executionRows.length>50,
    workflows,executions:visible,
    certifiedAgentCount:null,agentCertification:"not-verified",
    providerConnected:false,liveSyncEnabled:false,
    canStartWorkflow:false,canAttachAgent:false,canApprove:false,
    provenance:"stored-metadata-only",
  });
}
