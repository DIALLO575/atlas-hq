import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  N8nMcpOfflineError, N8N_MCP_OPERATION_POLICIES,
  inspectN8nMcpToolList, planN8nMcpOperation, createN8nMcpOfflineClient,
} from "../packages/engines/n8n/src/mcp-client.mjs";
import { n8nReleasePermission } from "../packages/engine-core/src/release-gates.mjs";

const W="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const I="aaaaaaaa-0000-4000-8000-000000000001";
const F="aaaa0000-0000-4000-8000-000000000001";
const K="11111111-1111-4111-8111-111111111111";
const HASH="a".repeat(64);
const blocked=code=>err=>err instanceof N8nMcpOfflineError&&err.code===code;
const mock=(tools,id=9,extra={})=>({jsonrpc:"2.0",id,result:{tools:tools.map(t=>typeof t==="string"?{name:t}:t),...extra}});
const plan=(operation,rest={})=>planN8nMcpOperation({
 workspaceId:W,instanceId:I,n8nVersion:"2.35.0",operation,...rest,
});
test("MCP catalogue matches Atlas contracts without claiming live availability",()=>{
 assert.equal(N8N_MCP_OPERATION_POLICIES.length,7);
 assert.equal(new Set(N8N_MCP_OPERATION_POLICIES.map(x=>x.capability)).size,7);
 assert.equal(N8N_MCP_OPERATION_POLICIES.find(x=>x.capability==="workflows.ai.test").mode,"execute");
 assert.equal(N8N_MCP_OPERATION_POLICIES.find(x=>x.capability==="workflows.publish").mode,"write");
 assert.ok(N8N_MCP_OPERATION_POLICIES.every(p=>Object.isFrozen(p)&&!p.callable&&!p.available));
});
test("protocol request prepared for tools/list is NEVER sent, even with injected mock transport",async()=>{
 let calls=0;
 const client=createN8nMcpOfflineClient({exchange:async()=>{calls++;return mock(["validate_workflow"]);}});
 const req=client.prepareDiscovery({requestId:9,n8nVersion:"2.35.0"});
 assert.deepEqual(req,{jsonrpc:"2.0",id:9,method:"tools/list",params:{},
  canSend:false,providerIoEnabled:false});
 assert.ok(Object.isFrozen(req));
 await assert.rejects(client.discover(),e=>blocked("N8N_DURABLE_RELEASE_GATE_CLOSED")(e)&&e.status===423);
 await assert.rejects(client.callTool(),blocked("N8N_DURABLE_RELEASE_GATE_CLOSED"));
 assert.equal(calls,0);
 assert.equal(n8nReleasePermission({ATLAS_N8N_MCP_ENABLED:"true"},"execute").allowed,false);
});
test("tools/list parsing exposes only named policies, not untrusted descriptions/schemas/annotations",()=>{
 const token="SENSITIVE_MCP_TOOL_DESCRIPTION_TEST";
 const frame=mock([
  {name:"validate_workflow",description:token,inputSchema:{properties:{apiKey:{default:token}}}},
  {name:"publish_workflow",annotations:{readOnlyHint:true},description:token},
  {name:"search_workflows",description:token},
  {name:"get_workflow_details",description:token},
  {name:"unapproved_tool",description:token},
 ]);
 const discovery=inspectN8nMcpToolList({frame,requestId:9,n8nVersion:"2.35.0"});
 assert.equal(discovery.toolsInspected,5);
 assert.equal(discovery.complete,true);
 assert.equal(discovery.available,false);
 assert.equal(discovery.canCall,false);
 assert.equal(discovery.capabilities.find(x=>x.operation==="workflows.publish").advertised,true);
 assert.equal(discovery.capabilities.find(x=>x.operation==="workflows.ai.create").advertised,false);
 assert.ok(discovery.capabilities.every(x=>x.available===false&&x.callable===false&&x.authorizationVerified===false));
 assert.equal(JSON.stringify(discovery).includes(token),false);
 assert.equal(JSON.stringify(discovery).includes("search_workflows"),false);
 assert.ok(Object.isFrozen(discovery.capabilities));
});
test("version constraints: test_workflow requires 2.15.0 and is executable, not a safe read",()=>{
 const frame=mock(["validate_workflow","test_workflow","publish_workflow"]);
 const before=inspectN8nMcpToolList({frame,requestId:9,n8nVersion:"2.14.9"});
 const after=inspectN8nMcpToolList({frame,requestId:9,n8nVersion:"2.15.0"});
 assert.equal(before.capabilities.find(x=>x.operation==="workflows.ai.test").advertised,false);
 assert.equal(after.capabilities.find(x=>x.operation==="workflows.ai.test").advertised,true);
 assert.equal(after.capabilities.find(x=>x.operation==="workflows.ai.test").mode,"execute");
 assert.throws(()=>plan("workflows.ai.test",{n8nVersion:"2.14.9",workflowId:F,
  intentDigest:HASH,idempotencyKey:K}),blocked("N8N_MCP_VERSION_UNSUPPORTED"));
});
test("pagination uncertainty cannot be interpreted as complete tool discovery",()=>{
 const partial=inspectN8nMcpToolList({frame:mock(["validate_workflow"],9,{nextCursor:"cursor_a"}),
   requestId:9,n8nVersion:"2.35.0"});
 assert.equal(partial.complete,false);
 assert.equal(partial.canCall,false);
 assert.throws(()=>inspectN8nMcpToolList({frame:mock([],9,{nextCursor:44}),
   requestId:9,n8nVersion:"2.35.0"}),blocked("N8N_MCP_DISCOVERY_INVALID"));
});
test("malformed provider JSON-RPC, error frames, duplicate tools and spoofed ids rejected",()=>{
 for(const frame of [
  {jsonrpc:"2.0",id:9,error:{code:-32000,message:"no"}},
  {jsonrpc:"1.0",id:9,result:{tools:[]}},
  mock(["validate_workflow"],7),
  mock(["validate_workflow","validate_workflow"]),
  mock(["../admin"]),
  mock(Array(101).fill("tool_"+String(Math.random()).slice(2))),
  {jsonrpc:"2.0",id:9,result:{tools:"no"}},
 ])assert.throws(()=>inspectN8nMcpToolList({frame,requestId:9,n8nVersion:"2.35.0"}),
  blocked("N8N_MCP_DISCOVERY_INVALID"));
 assert.throws(()=>inspectN8nMcpToolList({frame:mock([]),requestId:-1,n8nVersion:"2.35.0"}),
  blocked("N8N_MCP_REQUEST_ID_INVALID"));
});
test("read-only validation accepts a SHA digest but never raw user code or a tool call",()=>{
 const draft=plan("workflows.ai.validate",{codeSha256:HASH});
 assert.equal(draft.mode,"read");
 assert.equal(draft.requiresHumanApproval,false);
 assert.equal(draft.canCall,false);
 assert.equal(draft.providerIoEnabled,false);
 assert.deepEqual(Object.keys(draft).filter(k=>/prompt|codeBody|token|credential/i.test(k)),[]);
 assert.equal(draft.codeSha256,HASH);
 assert.throws(()=>plan("workflows.ai.validate",{codeSha256:HASH,code:"import evil"}),
  blocked("N8N_MCP_INPUT_INVALID"));
});
test("create/publish/update all require durable intent and write approvals, but cannot run",()=>{
 const create=plan("workflows.ai.create",{codeSha256:HASH,intentDigest:HASH,idempotencyKey:K});
 const publish=plan("workflows.publish",{workflowId:F,intentDigest:HASH,
  idempotencyKey:K,expectedVersion:"remote_v3"});
 const update=plan("workflows.ai.update",{workflowId:F,intentDigest:HASH,
  idempotencyKey:K,expectedVersion:"remote_v3",codeSha256:HASH});
 for(const draft of [create,publish,update]){
  assert.equal(draft.requiresHumanApproval,true);
  assert.equal(draft.requiresReviewedLicenseForExternalCustomers,true);
  assert.equal(draft.requiresDurableApprovedIntent,true);
  assert.equal(draft.requiresCommonWorker,true);
  assert.equal(draft.canEnqueue,false);
  assert.equal(draft.canCall,false);
  assert.equal(draft.canPublish,false);
  assert.equal(draft.releaseCode,"N8N_DURABLE_RELEASE_GATE_CLOSED");
 }
});
test("no self-approval, host, session, JWT, credential, URL or remote workflow id in planner",()=>{
 const seed={workspaceId:W,instanceId:I,n8nVersion:"2.35.0",operation:"workflows.ai.create",
  codeSha256:HASH,intentDigest:HASH,idempotencyKey:K};
 for(const key of ["approved","allow","url","host","token","authorization","actorId",
  "role","session","remoteWorkflowId","tool","arguments","code"]){
  assert.throws(()=>planN8nMcpOperation({...seed,[key]:"attacker"}),blocked("N8N_MCP_INPUT_INVALID"));
 }
 assert.throws(()=>planN8nMcpOperation({...seed,workspaceId:"other"}),blocked("N8N_MCP_SCOPE_INVALID"));
 assert.throws(()=>planN8nMcpOperation({...seed,operation:"search_workflows"}),blocked("N8N_MCP_OPERATION_UNKNOWN"));
 assert.throws(()=>planN8nMcpOperation({...seed,operation:"tools/call"}),blocked("N8N_MCP_OPERATION_UNKNOWN"));
});
test("workflow scope is ATLAS UUID, never a remote n8n identifier or cross-tenant URL",()=>{
 assert.throws(()=>plan("workflows.publish",{workflowId:"n8n_1",intentDigest:HASH,idempotencyKey:K,
  expectedVersion:"v1"}),blocked("N8N_MCP_SCOPE_INVALID"));
 assert.throws(()=>plan("workflows.ai.create",{workflowId:F,codeSha256:HASH,intentDigest:HASH,
  idempotencyKey:K}),blocked("N8N_MCP_SCOPE_INVALID"));
});
test("mutation requires idempotency key/digest and version guards, validation remains read",()=>{
 assert.throws(()=>plan("workflows.ai.create",{codeSha256:HASH}),blocked("N8N_MCP_INTENT_REQUIRED"));
 assert.throws(()=>plan("workflows.ai.create",{codeSha256:HASH,intentDigest:"yes",idempotencyKey:K}),
  blocked("N8N_MCP_INTENT_REQUIRED"));
 assert.throws(()=>plan("workflows.publish",{workflowId:F,intentDigest:HASH,idempotencyKey:K}),
  blocked("N8N_MCP_VERSION_PRECONDITION_INVALID"));
 assert.throws(()=>plan("workflows.ai.validate",{codeSha256:HASH,intentDigest:HASH}),
  blocked("N8N_MCP_INTENT_UNEXPECTED"));
 assert.throws(()=>plan("workflows.ai.validate",{}),blocked("N8N_MCP_CODE_DIGEST_INVALID"));
});
test("execute_workflow and test_workflow are privileged operations, even in manual/test mode",()=>{
 for(const operation of ["workflows.ai.test","workflows.invoke_as_tool"]){
  const p=plan(operation,{workflowId:F,intentDigest:HASH,idempotencyKey:K});
  assert.equal(p.mode,"execute");
  assert.equal(p.requiresHumanApproval,true);
  assert.equal(p.requiresCommonWorker,true);
  assert.equal(p.canCall,false);
 }
});
test("version pinning never auto-infers n8n version or a supported MCP protocol era",()=>{
 assert.throws(()=>plan("tools.discover",{n8nVersion:"latest"}),blocked("N8N_MCP_VERSION_INVALID"));
 assert.throws(()=>plan("tools.discover",{n8nVersion:"v2.35.0"}),blocked("N8N_MCP_VERSION_INVALID"));
 assert.throws(()=>plan("tools.discover",{n8nVersion:"2.11.0"}),blocked("N8N_MCP_VERSION_UNSUPPORTED"));
 assert.throws(()=>createN8nMcpOfflineClient().prepareDiscovery({requestId:0,n8nVersion:"2.35.0"}),
  blocked("N8N_MCP_REQUEST_ID_INVALID"));
});
test("no runtime live MCP request endpoint, OAuth grant or action executor was added",async()=>{
 const s=await readFile(new URL("../packages/engines/n8n/src/mcp-client.mjs",import.meta.url),"utf8");
 assert.doesNotMatch(s,/\bfetch\s*\(|\bcreateConnection\s*\(|\bspawn\s*\(|\bexec\s*\(|service_role|NEXT_PUBLIC_/);
 assert.match(s,/N8N_DURABLE_RELEASE_GATE_CLOSED/);
});
