/**
 * SHA-179 / PR08: ATLAS Action Gateway (OFFLINE).
 *
 * One immutable allowlist for HTTP and MCP projections. Existing connector
 * code is the only permitted implementation source; these import checks
 * ensure a catalog rename cannot silently claim an unimplemented adapter.
 *
 * This package NEVER contacts providers, reads OAuth secrets, refreshes a
 * grant, executes tools, writes an outbox, or accepts an n8n token as an Atlas
 * principal. Existing owner-specific connector routes remain authoritative.
 */
import { createAuthorizedGitHubReader } from "../../connectors/github/src/authorized-reader.mjs";
import { LINEAR_READ_PAGE_SIZE } from "../../connectors/linear/src/linear-read.mjs";
import { NOTION_IMPLEMENTED_CAPABILITIES } from "../../connectors/notion/src/capabilities.mjs";
import { createHash } from "node:crypto";

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[a-f0-9]{12}$/i;
const isRecord=x=>x!==null&&typeof x==="object"&&!Array.isArray(x);
const hasOwn=(v,k)=>Object.prototype.hasOwnProperty.call(v,k);
export class AtlasActionGatewayError extends Error {
  constructor(code,status=400){super(code);this.name="AtlasActionGatewayError";this.code=code;this.status=status;}
}
const fail=(code,status=400)=>{throw new AtlasActionGatewayError(code,status);};
function shape(x,required,allowed=required){
  if(!isRecord(x)||required.some(k=>!hasOwn(x,k))||
    Object.keys(x).some(k=>!allowed.includes(k)))fail("ATLAS_ACTION_INPUT_INVALID");
}
if(typeof createAuthorizedGitHubReader!=="function"||
  LINEAR_READ_PAGE_SIZE!==25||NOTION_IMPLEMENTED_CAPABILITIES["search.title"]?.implemented!==true)
  throw new Error("ATLAS_CONNECTOR_READ_CONTRACT_DRIFT");

/**
 * These are *implemented code paths*, NOT authenticated connections or live
 * permissions. Machine use of personal Linear/Notion OAuth is NOT approved.
 * No GitHub Studio mutation is advertised, and no client can choose a URL.
 */
const specs=[
  {id:"github.repositories.list",tool:"atlas_github_repositories_list",provider:"github",
   adapter:"createAuthorizedGitHubReader().listRepositories",risk:"read",
   source:"github-installation",inputs:"none",readOnly:true},
  {id:"linear.teams.list",tool:"atlas_linear_teams_list",provider:"linear",
   adapter:"readLinearResourceRoute(resource=teams)",risk:"read",
   source:"linear-personal-oauth",inputs:"none",readOnly:true},
  {id:"notion.search.title",tool:"atlas_notion_search_title",provider:"notion",
   adapter:"loadNotionPersonalConnection().client.searchByTitle",risk:"read",
   source:"notion-personal-oauth",inputs:"title-query",readOnly:true},
];
export const ATLAS_ACTION_CATALOG=Object.freeze(specs.map(s=>Object.freeze({
  ...s,version:1,implemented:true,
  available:false,callable:false,granted:false,
  requiresUserSession:true,requiresWorkspaceMembership:true,
  requiresVerifiedProviderGrant:true,requiresServerCredential:true,
  requiresResourceScope:true,requiresTrustedServerWorker:true,
})));
const byId=new Map(ATLAS_ACTION_CATALOG.map(x=>[x.id,x]));
const byTool=new Map(ATLAS_ACTION_CATALOG.map(x=>[x.tool,x]));

function inputFor(def,value){
  if(!isRecord(value))fail("ATLAS_ACTION_ARGUMENTS_INVALID");
  if(def.inputs==="none"){
    if(Object.keys(value).length!==0)fail("ATLAS_ACTION_ARGUMENTS_INVALID");
    return Object.freeze({});
  }
  if(Object.keys(value).some(x=>x!=="query")||Object.keys(value).length!==1||
      typeof value.query!=="string"||value.query.length>100||
      /[\u0000-\u001f\u007f]/.test(value.query))
    fail("ATLAS_ACTION_ARGUMENTS_INVALID");
  return Object.freeze({query:value.query});
}
/** Stable intent is identical for the REST and MCP projections. */
export function planAtlasReadAction(input){
  shape(input,["workspaceId","connectionId","actionId","args","surface"]);
  const def=byId.get(input.actionId);
  if(!def)fail("ATLAS_ACTION_NOT_ALLOWLISTED",403);
  if(!UUID.test(input.workspaceId??"")||!UUID.test(input.connectionId??""))
    fail("ATLAS_ACTION_SCOPE_INVALID");
  if(input.surface!=="rest"&&input.surface!=="mcp")
    fail("ATLAS_ACTION_SURFACE_INVALID");
  const args=inputFor(def,input.args);
  const canonical=JSON.stringify({
    catalogVersion:1,workspaceId:input.workspaceId.toLowerCase(),
    connectionId:input.connectionId.toLowerCase(),actionId:def.id,args,
  });
  return Object.freeze({
    kind:"atlas-action-read-draft",
    workspaceId:input.workspaceId.toLowerCase(),
    connectionId:input.connectionId.toLowerCase(),
    actionId:def.id,provider:def.provider,toolName:def.tool,
    surface:input.surface,risk:"read",args,
    intentSha256:createHash("sha256").update(canonical).digest("hex"),
    authorized:false,providerConnected:false,credentialShared:false,
    requiresActorAndMachineBinding:true,requiresCurrentWorkspaceAndUserGrant:true,
    requiresSourceConnectorAuthorization:true,requiresProviderEvidence:true,
    requiresBoundedOutputProjection:true,requiresAuditedRead:true,
    canRead:false,canWrite:false,canCall:false,canEnqueue:false,
  });
}
/**
 * Shared manifest, no MCP tools/call endpoint. Do not present unverified
 * tools/list to a remote agent as an effective bearer/permission grant.
 */
export function projectAtlasActionCatalog(surface="rest"){
  if(surface!=="rest"&&surface!=="mcp")fail("ATLAS_ACTION_SURFACE_INVALID");
  return Object.freeze(ATLAS_ACTION_CATALOG.map(item=>Object.freeze({
    id:item.id,version:item.version,provider:item.provider,mode:"read",
    toolName:item.tool,implemented:item.implemented,
    available:false,callable:false,authorized:false,
    source:item.source,
    inputSchema:item.inputs==="none"?
      Object.freeze({type:"object",properties:Object.freeze({}),additionalProperties:false}):
      Object.freeze({type:"object",properties:Object.freeze({
        query:Object.freeze({type:"string",maxLength:100}),
      }),required:Object.freeze(["query"]),additionalProperties:false}),
  })));
}
/** Translate a tool name into the SAME underlying, uncallable REST intent. */
export function planAtlasMcpTool(input){
  shape(input,["workspaceId","connectionId","toolName","arguments"]);
  const def=byTool.get(input.toolName);
  if(!def)fail("ATLAS_ACTION_NOT_ALLOWLISTED",403);
  return planAtlasReadAction({
    workspaceId:input.workspaceId,connectionId:input.connectionId,
    actionId:def.id,args:input.arguments,surface:"mcp",
  });
}
/**
 * Authorization evidence is injected by a trusted server test harness today.
 * A real Atlas machine principal must bind to an existing actor/session/run
 * and recheck grants in a transaction. This function cannot call a provider.
 */
export function createAtlasActionGatewayPreflight({authenticate,repository}={}){
  if(typeof authenticate!=="function"||!isRecord(repository)||
     typeof repository.transaction!=="function")fail("ATLAS_ACTION_BACKEND_UNAVAILABLE",503);
  return Object.freeze({
    async inspect({session,plan}={}){
      if(!isRecord(plan)||plan.kind!=="atlas-action-read-draft"||
         !byId.has(plan.actionId)||plan.canCall!==false||plan.canRead!==false||
         plan.authorized!==false||!UUID.test(plan.workspaceId??"")||
         !UUID.test(plan.connectionId??""))
        fail("ATLAS_ACTION_UNTRUSTED_PLAN",403);
      // Never trust claimed provider, tool name, mode or digest from a caller.
      let rebuilt;
      try{rebuilt=planAtlasReadAction({
        workspaceId:plan.workspaceId,connectionId:plan.connectionId,
        actionId:plan.actionId,args:plan.args,surface:plan.surface,
      });}catch{fail("ATLAS_ACTION_UNTRUSTED_PLAN",403);}
      if(plan.provider!==rebuilt.provider||plan.toolName!==rebuilt.toolName||
         plan.risk!==rebuilt.risk||plan.intentSha256!==rebuilt.intentSha256||
         plan.credentialShared!==false||plan.canWrite!==false)
        fail("ATLAS_ACTION_UNTRUSTED_PLAN",403);
      let actor;
      try{actor=await authenticate(session);}catch{fail("ATLAS_ACTION_AUTH_REQUIRED",401);}
      if(!isRecord(actor)||!UUID.test(actor.userId??"")||
         !UUID.test(actor.sessionId??"")||actor.verified!==true)
        fail("ATLAS_ACTION_AUTH_REQUIRED",401);
      try{
        return await repository.transaction(async tx=>{
          if(!isRecord(tx)||["sessionActive","workspaceRole","connectionForActor","providerReadGrant"]
            .some(k=>typeof tx[k]!=="function"))
            fail("ATLAS_ACTION_BACKEND_UNAVAILABLE",503);
          if(await tx.sessionActive(actor.userId,actor.sessionId)!==true)
            fail("ATLAS_ACTION_SESSION_REVOKED",401);
          const role=await tx.workspaceRole(plan.workspaceId,actor.userId);
          if(!["owner","admin","member"].includes(role))
            fail("ATLAS_ACTION_WORKSPACE_FORBIDDEN",403);
          const binding=await tx.connectionForActor({
            workspaceId:plan.workspaceId,connectionId:plan.connectionId,
            actorId:actor.userId,provider:plan.provider,
          });
          if(!isRecord(binding)||binding.workspaceId!==plan.workspaceId||
             binding.connectionId!==plan.connectionId||
             binding.actorId!==actor.userId||binding.provider!==plan.provider||
             binding.active!==true||binding.revoked===true)
            fail("ATLAS_ACTION_CONNECTION_FORBIDDEN",403);
          const proof=await tx.providerReadGrant({
            workspaceId:plan.workspaceId,connectionId:plan.connectionId,
            actorId:actor.userId,provider:plan.provider,actionId:plan.actionId,
          });
          if(proof!==true)fail("ATLAS_ACTION_GRANT_FORBIDDEN",403);
          return Object.freeze({
            kind:"atlas-action-preflight-diagnostic",actionId:plan.actionId,
            provider:plan.provider,workspaceId:plan.workspaceId,
            connectionId:plan.connectionId,actorVerified:true,
            workspaceMembershipVerified:true,serverGrantChecked:true,
            requiresSourceConnectorRecheck:true,
            requiresAuditedRead:true,requiresVerifiedMachineBinding:true,
            canRead:false,canCall:false,canEnqueue:false,credentialShared:false,
          });
        });
      }catch(e){
        if(e instanceof AtlasActionGatewayError)throw e;
        fail("ATLAS_ACTION_BACKEND_UNAVAILABLE",503);
      }
    },
    async call(){fail("ATLAS_ACTION_GATEWAY_NOT_RELEASED",423);},
    async toolsCall(){fail("ATLAS_ACTION_GATEWAY_NOT_RELEASED",423);},
  });
}
