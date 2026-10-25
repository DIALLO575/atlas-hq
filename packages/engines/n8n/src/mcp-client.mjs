/**
 * SHA-178: instance-level n8n MCP OFFLINE discovery and intent planner.
 * Not MCP Server Trigger / MCP Client Tool. No HTTP, OAuth, secrets, UI or SDK.
 * ALL provider I/O remains hard-blocked by SHA-176 shared release gate.
 * Provider tool names/descriptions/schemas are UNTRUSTED, never grants.
 */
import { n8nReleasePermission } from "../../../engine-core/src/release-gates.mjs";
import { N8N_CAPABILITIES } from "./contracts.mjs";
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const SHA=/^[a-f0-9]{64}$/, OPAQUE=/^[A-Za-z0-9_-]{1,128}$/;
const TOOL=/^[a-z][a-z0-9_]{1,79}$/, SEMVER=/^(0|[1-9][0-9]{0,3})\.(0|[1-9][0-9]{0,3})\.(0|[1-9][0-9]{0,3})$/;
const record=x=>x!==null && typeof x==="object" && !Array.isArray(x);
export class N8nMcpOfflineError extends Error {
  constructor(code,status=400){super(code);this.name="N8nMcpOfflineError";this.code=code;this.status=status;}
}
const fail=(code,status=400)=>{throw new N8nMcpOfflineError(code,status);};
function shape(obj,allowed,required=allowed){
  if(!record(obj)||Object.keys(obj).some(k=>!allowed.includes(k))||
     required.some(k=>!Object.hasOwn(obj,k)))fail("N8N_MCP_INPUT_INVALID");
}
function version(v){
  if(typeof v!=="string"||!SEMVER.test(v))fail("N8N_MCP_VERSION_INVALID");
  return v.split(".").map(Number);
}
function supports(v,min){
  const a=version(v),b=version(min);
  for(let i=0;i<3;i++)if(a[i]!==b[i])return a[i]>b[i];
  return true;
}
const definitions=[
  ["tools.discover",null,"2.12.0","instance","read"],
  ["workflows.ai.validate","validate_workflow","2.12.0","instance","read"],
  ["workflows.ai.create","create_workflow_from_code","2.12.0","instance","write"],
  ["workflows.ai.update","update_workflow","2.12.0","workflow","write"],
  ["workflows.publish","publish_workflow","2.12.0","workflow","write"],
  ["workflows.ai.test","test_workflow","2.15.0","workflow","execute"],
  ["workflows.invoke_as_tool","execute_workflow","2.12.0","workflow","execute"],
];
const catalog=new Map(N8N_CAPABILITIES.map(c=>[c.id,c]));
export const N8N_MCP_OPERATION_POLICIES=Object.freeze(definitions.map(([capability,tool,minVersion,scope,mode])=>{
  const atlas=catalog.get(capability);
  if(!atlas||atlas.transport!=="mcp"||atlas.mode!==mode||atlas.scope!==scope)
    throw new Error("N8N_MCP_CONTRACT_MISMATCH");
  return Object.freeze({capability,tool,minVersion,scope,mode,
    discoveryOnly:tool===null,requiresHumanApproval:mode!=="read",available:false,callable:false});
}));
const operations=new Map(N8N_MCP_OPERATION_POLICIES.map(p=>[p.capability,p]));
const toolNames=new Map(N8N_MCP_OPERATION_POLICIES.filter(p=>p.tool).map(p=>[p.tool,p]));

/** Accepts decoded tools/list JSON-RPC; emits only safe allowlisted metadata. */
export function inspectN8nMcpToolList(input){
  shape(input,["frame","requestId","n8nVersion"]);
  const {frame,requestId,n8nVersion}=input;
  version(n8nVersion);
  if(!Number.isSafeInteger(requestId)||requestId<1||requestId>1000000)
    fail("N8N_MCP_REQUEST_ID_INVALID");
  if(!record(frame)||frame.jsonrpc!=="2.0"||frame.id!==requestId||
     Object.hasOwn(frame,"error")||!record(frame.result)||!Array.isArray(frame.result.tools)||
     frame.result.tools.length>100)fail("N8N_MCP_DISCOVERY_INVALID");
  const seen=new Set(),known=new Set();
  for(const item of frame.result.tools){
    if(!record(item)||typeof item.name!=="string"||!TOOL.test(item.name)||seen.has(item.name))
      fail("N8N_MCP_DISCOVERY_INVALID");
    seen.add(item.name);
    if(toolNames.has(item.name))known.add(item.name);
  }
  const cursor=frame.result.nextCursor;
  if(cursor!==undefined&&cursor!==null&&(typeof cursor!=="string"||
    cursor.length<1||cursor.length>400))fail("N8N_MCP_DISCOVERY_INVALID");
  return Object.freeze({
    kind:"n8n-mcp-discovery-draft",n8nVersion,toolsInspected:seen.size,
    complete:cursor===undefined||cursor===null,available:false,canCall:false,
    requiresHostVerification:true,requiresAtlasWorkspaceAndUserGrant:true,
    capabilities:Object.freeze(N8N_MCP_OPERATION_POLICIES.map(p=>Object.freeze({
      operation:p.capability,providerTool:p.tool,mode:p.mode,scope:p.scope,
      minVersion:p.minVersion,versionCompatible:supports(n8nVersion,p.minVersion),
      advertised:p.tool!==null&&known.has(p.tool)&&supports(n8nVersion,p.minVersion),
      available:false,callable:false,authorizationVerified:false,
    }))),
  });
}

/** No caller-provided code, workflow graph, OAuth secret, tool name, role or approval. */
export function planN8nMcpOperation(input){
  shape(input,["workspaceId","instanceId","operation","n8nVersion","workflowId",
    "codeSha256","intentDigest","idempotencyKey","expectedVersion"],
    ["workspaceId","instanceId","operation","n8nVersion"]);
  const p=operations.get(input.operation);
  if(!p)fail("N8N_MCP_OPERATION_UNKNOWN");
  if(!UUID.test(input.workspaceId??"")||!UUID.test(input.instanceId??""))
    fail("N8N_MCP_SCOPE_INVALID");
  if(!supports(input.n8nVersion,p.minVersion))fail("N8N_MCP_VERSION_UNSUPPORTED",423);
  if(p.scope==="workflow"){
    if(typeof input.workflowId!=="string"||!UUID.test(input.workflowId))
      fail("N8N_MCP_SCOPE_INVALID");
  }else if(input.workflowId!==undefined)fail("N8N_MCP_SCOPE_INVALID");
  const code=p.capability==="workflows.ai.validate"||p.capability==="workflows.ai.create"||
    p.capability==="workflows.ai.update";
  if(code?!SHA.test(input.codeSha256??""):input.codeSha256!==undefined)
    fail("N8N_MCP_CODE_DIGEST_INVALID");
  const mutation=p.mode!=="read";
  if(mutation){
    if(!SHA.test(input.intentDigest??"")||!UUID.test(input.idempotencyKey??""))
      fail("N8N_MCP_INTENT_REQUIRED");
  }else if(input.intentDigest!==undefined||input.idempotencyKey!==undefined)
    fail("N8N_MCP_INTENT_UNEXPECTED");
  const versioned=p.capability==="workflows.ai.update"||p.capability==="workflows.publish";
  if(versioned?(typeof input.expectedVersion!=="string"||!OPAQUE.test(input.expectedVersion))
    :input.expectedVersion!==undefined)fail("N8N_MCP_VERSION_PRECONDITION_INVALID");
  const release=n8nReleasePermission({},p.mode);
  if(release.allowed!==false||release.status!==423)fail("N8N_MCP_GATE_INVARIANT_FAILED");
  return Object.freeze({
    kind:"n8n-mcp-action-draft",workspaceId:input.workspaceId,instanceId:input.instanceId,
    workflowId:p.scope==="workflow"?input.workflowId:null,operation:p.capability,
    providerTool:p.tool,transport:"mcp",mode:p.mode,n8nVersion:input.n8nVersion,
    ...(code?{codeSha256:input.codeSha256}:{}),
    ...(mutation?{intentDigest:input.intentDigest,idempotencyKey:input.idempotencyKey}:{}),
    ...(versioned?{expectedVersion:input.expectedVersion}:{}),
    requiresHumanApproval:p.requiresHumanApproval,requiresTrustedProviderBindings:true,
    requiresServerIdentityAndGrants:true,requiresReviewedLicenseForExternalCustomers:true,
    requiresEgressCertification:true,requiresDurableApprovedIntent:mutation,
    requiresCommonWorker:mutation,providerIoEnabled:false,
    canCall:false,canEnqueue:false,canPublish:false,releaseCode:release.code,
  });
}

/** Even injected transport callbacks cannot be invoked before a reviewed release. */
export function createN8nMcpOfflineClient({exchange}={}){
  if(exchange!==undefined&&typeof exchange!=="function")fail("N8N_MCP_EXCHANGE_INVALID");
  return Object.freeze({
    prepareDiscovery({requestId,n8nVersion}={}){
      version(n8nVersion);
      if(!Number.isSafeInteger(requestId)||requestId<1||requestId>1000000)
        fail("N8N_MCP_REQUEST_ID_INVALID");
      return Object.freeze({jsonrpc:"2.0",id:requestId,method:"tools/list",
        params:Object.freeze({}),canSend:false,providerIoEnabled:false});
    },
    inspectDiscovery:inspectN8nMcpToolList,planOperation:planN8nMcpOperation,
    async discover(){fail("N8N_DURABLE_RELEASE_GATE_CLOSED",423);},
    async callTool(){fail("N8N_DURABLE_RELEASE_GATE_CLOSED",423);},
  });
}
