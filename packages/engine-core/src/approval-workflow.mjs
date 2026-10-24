import { createHash } from "node:crypto";

/**
 * SHA-150 — server-only human approval workflow CONTRACT.
 * This is not an exposed endpoint or a worker. The transaction adapter must
 * verify auth.sessions, workspace roles and the immutable run payload digest.
 * The current SQL schema lacks intent_digest on runs/approvals; do not wire
 * this to production until a separately reviewed additive migration exists.
 */
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA=/^[0-9a-f]{64}$/;
const PRIMITIVE=/^[a-z][a-z0-9._-]{1,119}$/;
const REVIEW_WINDOW_MS=15*60*1000;
const ROLES=new Set(["owner","admin","member"]);
const rec=x=>x!==null&&typeof x==="object"&&!Array.isArray(x);
export class EngineApprovalError extends Error {
  constructor(code){super(code);this.name="EngineApprovalError";this.code=code;}
}
const fail=code=>{throw new EngineApprovalError(code);};
function exact(raw,fields){
  if(!rec(raw)||Object.keys(raw).some(k=>!fields.includes(k))||
      fields.some(k=>!Object.hasOwn(raw,k)))fail("APPROVAL_INPUT_INVALID");
}
function scope(input) {
  exact(input,["workspaceId","instanceId","runId"]);
  if(![input.workspaceId,input.instanceId,input.runId].every(x=>typeof x==="string"&&UUID.test(x)))
    fail("APPROVAL_SCOPE_INVALID");
  return Object.freeze({
    workspaceId:input.workspaceId.toLowerCase(),
    instanceId:input.instanceId.toLowerCase(),
    runId:input.runId.toLowerCase(),
  });
}
function sourceRun(row,s){
  if(!rec(row)||row.workspace_id!==s.workspaceId||
      row.instance_id!==s.instanceId||row.id!==s.runId||
      typeof row.mission_id!=="string"||!UUID.test(row.mission_id)||
      typeof row.requested_by!=="string"||!UUID.test(row.requested_by)||
      typeof row.primitive_id!=="string"||!PRIMITIVE.test(row.primitive_id)||
      typeof row.payload_sha256!=="string"||!SHA.test(row.payload_sha256)||
      !["draft","awaiting-approval","authorized"].includes(row.state))
    fail("APPROVAL_RUN_UNAVAILABLE");
  return row;
}
/** A purpose-bound digest of the immutable run intent, never the raw payload. */
export function engineApprovalIntentDigest(run){
  if(!rec(run)||typeof run.workspace_id!=="string"||!UUID.test(run.workspace_id)||
      typeof run.instance_id!=="string"||!UUID.test(run.instance_id)||
      typeof run.id!=="string"||!UUID.test(run.id)||
      typeof run.mission_id!=="string"||!UUID.test(run.mission_id)||
      typeof run.primitive_id!=="string"||!PRIMITIVE.test(run.primitive_id)||
      typeof run.payload_sha256!=="string"||!SHA.test(run.payload_sha256))
    fail("APPROVAL_INTENT_INVALID");
  return createHash("sha256").update(JSON.stringify([
    "atlas-engine-approval-v1",run.workspace_id.toLowerCase(),
    run.instance_id.toLowerCase(),run.id.toLowerCase(),
    run.mission_id.toLowerCase(),run.primitive_id,run.payload_sha256,
  ])).digest("hex");
}
function authenticated(result){
  if(!rec(result)||result.verified!==true||
      typeof result.actorId!=="string"||!UUID.test(result.actorId)||
      typeof result.sessionId!=="string"||!UUID.test(result.sessionId))
    fail("APPROVAL_AUTH_REQUIRED");
  return {actorId:result.actorId.toLowerCase(),sessionId:result.sessionId.toLowerCase()};
}
function approvalRow(row,s,run){
  if(!rec(row)||row.workspace_id!==s.workspaceId||
      row.instance_id!==s.instanceId||row.run_id!==s.runId||
      row.requested_by!==run.requested_by||
      typeof row.intent_digest!=="string"||!SHA.test(row.intent_digest)||
      row.intent_digest!==engineApprovalIntentDigest(run)||
      !["pending","approved","rejected"].includes(row.decision)||
      typeof row.expires_at!=="string"||
      !Number.isFinite(Date.parse(row.expires_at)))
    fail("APPROVAL_RECORD_MISMATCH");
  return row;
}
const audit=(s,actor,event,digest)=>Object.freeze({
  workspace_id:s.workspaceId,instance_id:s.instanceId,run_id:s.runId,
  actor_id:actor,event_key:event,payload_digest:digest,
});
function repository(tx){
  for(const key of ["sessionActive","workspaceRole","getRunForUpdate",
    "getApprovalForUpdate","insertPending","decidePending","audit"]){
    if(!rec(tx)||typeof tx[key]!=="function")fail("APPROVAL_TRANSACTION_UNAVAILABLE");
  }
  return tx;
}
export function createEngineApprovalWorkflow({ authenticate, repository:db, now=()=>Date.now() }={}) {
  if(typeof authenticate!=="function"||!rec(db)||typeof db.transaction!=="function"||
     typeof now!=="function")fail("APPROVAL_DEPENDENCIES_INVALID");
  async function prepare(input,fields){
    exact(input,fields);
    const s=scope(input.scope);
    if(input.session===null||input.session===undefined)fail("APPROVAL_AUTH_REQUIRED");
    let auth;
    try{auth=authenticated(await authenticate(input.session));}
    catch{fail("APPROVAL_AUTH_REQUIRED");}
    return {s,auth};
  }
  async function atomic({s,auth},fn){
    try{
      return await db.transaction(async rawTx=>{
        const tx=repository(rawTx);
        if(await tx.sessionActive(auth.actorId,auth.sessionId)!==true)
          fail("APPROVAL_SESSION_REVOKED");
        const role=await tx.workspaceRole(s.workspaceId,auth.actorId);
        if(!ROLES.has(role))fail("APPROVAL_WORKSPACE_FORBIDDEN");
        const run=sourceRun(await tx.getRunForUpdate(s),s);
        return fn(tx,run,role);
      });
    }catch(error){
      if(error instanceof EngineApprovalError)throw error;
      fail("APPROVAL_STORAGE_UNAVAILABLE");
    }
  }
  return Object.freeze({
    async request(input){
      const p=await prepare(input,["scope","session"]);
      return atomic(p,async(tx,run)=>{
        if(run.requested_by!==p.auth.actorId||run.state!=="draft")
          fail("APPROVAL_REQUEST_FORBIDDEN");
        const time=now();
        if(!Number.isSafeInteger(time)||time<0)fail("APPROVAL_CLOCK_INVALID");
        const digest=engineApprovalIntentDigest(run);
        const existing=await tx.getApprovalForUpdate(p.s);
        if(existing!==null)fail("APPROVAL_ALREADY_EXISTS");
        await tx.insertPending(Object.freeze({
          workspace_id:p.s.workspaceId,instance_id:p.s.instanceId,run_id:p.s.runId,
          requested_by:p.auth.actorId,decision:"pending",
          intent_digest:digest,expires_at:new Date(time+REVIEW_WINDOW_MS).toISOString(),
        }));
        await tx.audit(audit(p.s,p.auth.actorId,"engine.approval.requested",digest));
        return Object.freeze({state:"pending",intentDigest:digest,expiresAt:new Date(time+REVIEW_WINDOW_MS).toISOString(),canDispatch:false});
      });
    },
    async decide(input){
      const p=await prepare(input,["scope","session","decision","expectedIntentDigest"]);
      if(!["approved","rejected"].includes(input.decision)||
         typeof input.expectedIntentDigest!=="string"||!SHA.test(input.expectedIntentDigest))
        fail("APPROVAL_DECISION_INVALID");
      return atomic(p,async(tx,run,role)=>{
        if(role!=="owner"&&role!=="admin")fail("APPROVAL_REVIEWER_FORBIDDEN");
        if(run.requested_by===p.auth.actorId)fail("APPROVAL_SELF_REVIEW_FORBIDDEN");
        if(!["draft","awaiting-approval"].includes(run.state))
          fail("APPROVAL_RUN_NOT_REVIEWABLE");
        const pending=approvalRow(await tx.getApprovalForUpdate(p.s),p.s,run);
        if(pending.decision!=="pending")fail("APPROVAL_ALREADY_DECIDED");
        const time=now();
        if(!Number.isSafeInteger(time)||time<0||Date.parse(pending.expires_at)<=time)
          fail("APPROVAL_EXPIRED");
        if(input.expectedIntentDigest!==pending.intent_digest)
          fail("APPROVAL_INTENT_CHANGED");
        const changed=await tx.decidePending(Object.freeze({
          ...p.s,decision:input.decision,reviewerId:p.auth.actorId,
          intentDigest:pending.intent_digest,decidedAt:new Date(time).toISOString(),
        }));
        if(changed!==true)fail("APPROVAL_RACE_LOST");
        await tx.audit(audit(p.s,p.auth.actorId,
          input.decision==="approved"?"engine.approval.approved":"engine.approval.rejected",
          pending.intent_digest));
        return Object.freeze({decision:input.decision,intentDigest:pending.intent_digest,
          canDispatch:false});
      });
    },
    async inspect(input){
      const p=await prepare(input,["scope","session"]);
      return atomic(p,async(tx,run,role)=>{
        if(run.requested_by!==p.auth.actorId&&role!=="owner"&&role!=="admin")
          fail("APPROVAL_VIEW_FORBIDDEN");
        const row=approvalRow(await tx.getApprovalForUpdate(p.s),p.s,run);
        return Object.freeze({
          decision:row.decision,intentDigest:row.intent_digest,
          expiresAt:row.expires_at,
          // No prompts, encrypted payload, reviewer PII, or live execution.
          canDispatch:false,
        });
      });
    },
  });
}
