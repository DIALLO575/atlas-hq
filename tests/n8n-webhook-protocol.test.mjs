import test from "node:test";
import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import { readFile } from "node:fs/promises";
import {
 N8nWebhookProtocolError, planN8nWebhookDispatch,
 assessN8nWebhookAttempt, verifyN8nCallbackEnvelope, planN8nCallbackTransition,
} from "../packages/engines/n8n/src/webhook-protocol.mjs";
import { n8nReleasePermission } from "../packages/engine-core/src/release-gates.mjs";

const W="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const I="aaaaaaaa-0000-4000-8000-000000000001";
const F="aaaa0000-0000-4000-8000-000000000001";
const E="aaaa1000-0000-4000-8000-000000000001";
const K="11111111-1111-4111-8111-111111111111";
const NONCE="n".repeat(32);
const TIMESTAMP="1792935000";
const secret=Buffer.alloc(48,7);
const body={version:1,workspaceId:W,instanceId:I,executionId:E,
 remoteExecutionId:"same-exec",status:"success",occurredAt:"2026-10-25T13:30:00.000Z"};
const isError=code=>e=>e instanceof N8nWebhookProtocolError && e.code===code;
const signer=(raw,key=secret,timestamp=TIMESTAMP,nonce=NONCE,keyId="sandbox-v1")=>{
 const digest=createHash("sha256").update(raw).digest("hex");
 const message=["atlas-n8n-callback-v1",timestamp,nonce,keyId,digest].join("\n");
 return {timestamp,nonce,keyId,
  signature:createHmac("sha256",key).update(message).digest("hex")};
};
const envelope=(content=body,key=secret,overrides={})=>{
 const rawBody=Buffer.from(JSON.stringify(content));
 return {rawBody,headers:signer(rawBody,key),secret:key,nowSeconds:Number(TIMESTAMP),...overrides};
};
const stored=(status="running",other={})=>({
 id:E,workspace_id:W,instance_id:I,remote_execution_id:"same-exec",
 status,event_version:0,last_seen_at:"2026-10-25T13:20:00.000Z",...other
});
const read=path=>readFile(new URL(path,import.meta.url),"utf8");

test("dispatch draft selects webhook and is forever non-executable",()=>{
 const draft=planN8nWebhookDispatch({
  workspaceId:W,instanceId:I,workflowId:F,
  intentDigest:"a".repeat(64),idempotencyKey:K,
 });
 assert.deepEqual([draft.capability,draft.transport,draft.mode],["workflows.invoke","webhook","execute"]);
 assert.equal(draft.requiresApprovedImmutableIntent,true);
 assert.equal(draft.requiresCommonDurableOutbox,true);
 assert.equal(draft.requiresSessionAndGrantRecheck,true);
 assert.equal(draft.canDispatch,false);
 assert.equal(draft.canEnqueue,false);
 assert.equal(Object.isFrozen(draft),true);
 assert.equal(JSON.stringify(draft).includes("https://"),false);
 assert.equal(n8nReleasePermission({ATLAS_N8N_RELEASE_STAGE:"enabled"},"execute").allowed,false);
});
test("never accept browser webhook URL, token, remote identity or self-approval",()=>{
 const args={workspaceId:W,instanceId:I,workflowId:F,intentDigest:"a".repeat(64),idempotencyKey:K};
 for(const key of ["url","host","token","apiKey","transport","remoteWorkflowId","actorId","approved","allowDispatch"]){
  assert.throws(()=>planN8nWebhookDispatch({...args,[key]:true}),isError("N8N_WEBHOOK_SHAPE_INVALID"));
 }
 for(const val of ["bad",null,0,{},undefined]){
  assert.throws(()=>planN8nWebhookDispatch({...args,workflowId:val}),isError("N8N_WEBHOOK_INTENT_INVALID"));
 }
 assert.throws(()=>planN8nWebhookDispatch({...args,intentDigest:"confirmed"}),isError("N8N_WEBHOOK_INTENT_INVALID"));
});
test("202/200 ACK is not success or a receipt, network timeout is unknown with zero retry",()=>{
 for(const code of [200,201,202,204]){
  const assessment=assessN8nWebhookAttempt({httpStatus:code,networkError:false});
  assert.equal(assessment.state,"acknowledged");
  assert.equal(assessment.requiresReconciliation,true);
  assert.equal(assessment.retryAutomatically,false);
 }
 for(const code of [429,500,503]){
  const assessment=assessN8nWebhookAttempt({httpStatus:code,networkError:false});
  assert.equal(assessment.state,"unknown");
  assert.equal(assessment.retryAutomatically,false);
 }
 assert.equal(assessN8nWebhookAttempt({httpStatus:401,networkError:false}).state,"rejected");
 const timeout=assessN8nWebhookAttempt({httpStatus:null,networkError:true});
 assert.deepEqual(timeout,{state:"unknown",effectMayHaveOccurred:true,
  retryAutomatically:false,canDispatch:false,requiresReconciliation:true});
 assert.throws(()=>assessN8nWebhookAttempt({httpStatus:202,networkError:true}),isError("N8N_WEBHOOK_RESULT_INVALID"));
});
test("valid HMAC signature returns only scoped, bounded, NON-PERSISTABLE metadata",()=>{
 const verified=verifyN8nCallbackEnvelope(envelope());
 assert.equal(verified.verifiedMac,true);
 assert.deepEqual([verified.workspaceId,verified.instanceId,verified.executionId],[W,I,E]);
 assert.equal(verified.remoteExecutionId,"same-exec");
 assert.equal(verified.status,"success");
 assert.equal(verified.nonce,NONCE);
 assert.equal(verified.bodySha256.length,64);
 assert.equal(verified.canPersist,false);
 assert.equal(verified.canApply,false);
 assert.equal(verified.canDispatch,false);
 assert.ok(Object.isFrozen(verified));
 assert.equal(JSON.stringify(verified).includes("signature"),false);
 assert.equal(JSON.stringify(verified).includes("secret"),false);
});
test("wrong secret, tampered body, tampered nonce and wrong key fail closed",()=>{
 const a=envelope();
 for(const params of [
  {...a,secret:Buffer.alloc(48,9)},
  {...a,rawBody:Buffer.from(JSON.stringify({...body,status:"error"}))},
  {...a,headers:{...a.headers,nonce:"x".repeat(32)}},
  {...a,headers:{...a.headers,keyId:"rotated"}},
  {...a,headers:{...a.headers,signature:"b".repeat(64)}},
 ]){
  assert.throws(()=>verifyN8nCallbackEnvelope(params),isError("N8N_CALLBACK_AUTHENTICATION_FAILED"));
 }
});
test("expired/future envelope, malformed signatures and replay identifiers fail",()=>{
 const a=envelope();
 for(const nowSeconds of [Number(TIMESTAMP)-301,Number(TIMESTAMP)+301]){
  assert.throws(()=>verifyN8nCallbackEnvelope({...a,nowSeconds}),isError("N8N_CALLBACK_TIMESTAMP_INVALID"));
 }
 for(const headers of [
  {...a.headers,timestamp:"not-a-timestamp"},
  {...a.headers,timestamp:"0"},
 ]){
  assert.throws(()=>verifyN8nCallbackEnvelope({...a,headers}),isError("N8N_CALLBACK_TIMESTAMP_INVALID"));
 }
 for(const headers of [
  {...a.headers,nonce:"short"},
  {...a.headers,keyId:"../../env"},
  {...a.headers,signature:"abc"},
 ]){
  assert.throws(()=>verifyN8nCallbackEnvelope({...a,headers}),isError("N8N_CALLBACK_HEADERS_INVALID"));
 }
 assert.throws(()=>verifyN8nCallbackEnvelope({...a,headers:{...a.headers,approved:true}}),isError("N8N_WEBHOOK_SHAPE_INVALID"));
});
test("strict payload allowlist rejects raw nodes, tokens, remote URL and unbound ID",()=>{
 for(const [name,val] of [
  ["token","abc"],["nodes",[]],["executionData",{secret:"hidden"}],
  ["approved",true],["host","localhost"],["url","https://example.org"],
 ]){
  assert.throws(()=>verifyN8nCallbackEnvelope(envelope({...body,[name]:val})),isError("N8N_WEBHOOK_SHAPE_INVALID"));
 }
 for(const changed of [
  {...body,workspaceId:"../admin"},
  {...body,remoteExecutionId:"../etc/passwd"},
  {...body,status:"approved"},
  {...body,version:2},
  {...body,occurredAt:"yesterday"},
 ]){
  assert.throws(()=>verifyN8nCallbackEnvelope(envelope(changed)),isError("N8N_CALLBACK_PAYLOAD_INVALID"));
 }
});
test("raw bytes and key must be present, nonempty, small and never serialized",()=>{
 const a=envelope();
 for(const v of [Buffer.alloc(0),Buffer.alloc(31,1),Buffer.alloc(513,1),"secret"]){
  assert.throws(()=>verifyN8nCallbackEnvelope({...a,secret:v}),isError("N8N_CALLBACK_KEY_UNAVAILABLE"));
 }
 for(const v of [Buffer.alloc(4097,1),Buffer.alloc(1,1),"{}",null]){
  assert.throws(()=>verifyN8nCallbackEnvelope({...a,rawBody:v}),isError("N8N_CALLBACK_BODY_INVALID"));
 }
 const rawBody=Buffer.from('{"bad":"json",');
 const signed=envelope(body,secret,{rawBody,headers:signer(rawBody)});
 assert.throws(()=>verifyN8nCallbackEnvelope(signed),isError("N8N_CALLBACK_BODY_INVALID"));
});
test("reconcile statuses monotonic and terminal conflict requires intervention",()=>{
 const verified=verifyN8nCallbackEnvelope(envelope());
 const p=planN8nCallbackTransition({verified,stored:stored()});
 assert.deepEqual({resolution:p.resolution,nextStatus:p.nextStatus,expected:p.expectedEventVersion,
  proposed:p.proposedEventVersion,canApply:p.canApply},
  {resolution:"propose",nextStatus:"success",expected:0,proposed:1,canApply:false});
 const duplicate=planN8nCallbackTransition({verified,stored:stored("success")});
 assert.equal(duplicate.resolution,"duplicate-state");
 assert.equal(duplicate.nextStatus,null);
 const conflict=planN8nCallbackTransition({verified,stored:stored("error")});
 assert.equal(conflict.resolution,"terminal-conflict");
 assert.equal(conflict.nextStatus,null);
 const late=planN8nCallbackTransition({verified,stored:stored("running",{last_seen_at:"2026-10-26T00:00:00.000Z"})});
 assert.equal(late.resolution,"late-event");
 assert.equal(late.canApply,false);
});
test("reconciliation rejects cross-tenant instance and spoofed remote execution ID",()=>{
 const verified=verifyN8nCallbackEnvelope(envelope());
 for(const row of [
  stored("running",{workspace_id:"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"}),
  stored("running",{instance_id:"bbbbbbbb-0000-4000-8000-000000000001"}),
  stored("running",{id:"bbbb1000-0000-4000-8000-000000000001"}),
  stored("running",{remote_execution_id:"different"}),
  stored("running",{event_version:-1}),
  stored("running",{status:"uncontrolled"}),
 ]){
  assert.throws(()=>planN8nCallbackTransition({verified,stored:row}),isError("N8N_CALLBACK_TARGET_INVALID"));
 }
});
test("simulation of two workers cannot create an actionable dispatch plan",()=>{
 const verified=verifyN8nCallbackEnvelope(envelope());
 const a=planN8nCallbackTransition({verified,stored:stored()});
 const b=planN8nCallbackTransition({verified,stored:stored()});
 assert.deepEqual(a,b);
 assert.equal(a.requiresTransactionLockAndCas,true);
 assert.equal(b.canApply,false);
 assert.equal(b.canDispatch,false);
 // The immutable drafts cannot bypass the unique SQL receipt + version CAS.
});
test("SQL receipts are private, tenant-bound and do not change offline gate",async()=>{
 const [migration,ci,baseGate] = await Promise.all([
  read("../supabase/migrations/20261025133921_atlas_n8n_callback_receipts.sql"),
  read("../.github/workflows/ci.yml"),
  read("../packages/engine-core/src/release-gates.mjs"),
 ]);
 assert.match(migration,/create table private\.atlas_automation_callback_receipts/);
 assert.match(migration,/unique\(workspace_id,instance_id,nonce\)/);
 assert.match(migration,/foreign key\(workspace_id,instance_id,execution_id\)/);
 assert.match(migration,/event_version bigint not null default 0/);
 assert.match(migration,/enable row level security/);
 assert.match(migration,/grant select,insert on table private\.atlas_automation_callback_receipts to service_role/);
 assert.doesNotMatch(migration,/grant .*authenticated|create policy.*authenticated|\bdelete from\b|\bdrop table\b/i);
 assert.match(ci,/n8n-callback-receipts-checks\.sql/);
 assert.match(baseGate,/N8N_DURABLE_RELEASE_GATE_CLOSED/);
});
