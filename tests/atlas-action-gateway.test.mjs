import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createAuthorizedGitHubReader } from "../packages/connectors/github/src/authorized-reader.mjs";
import { LINEAR_READ_PAGE_SIZE } from "../packages/connectors/linear/src/linear-read.mjs";
import { NOTION_IMPLEMENTED_CAPABILITIES } from "../packages/connectors/notion/src/capabilities.mjs";
import {
  ATLAS_ACTION_CATALOG, AtlasActionGatewayError,
  projectAtlasActionCatalog, planAtlasReadAction, planAtlasMcpTool,
  createAtlasActionGatewayPreflight,
} from "../packages/action-gateway/src/catalog.mjs";

const W="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const C="aaaaaaaa-0000-4000-8000-000000000001";
const U="11111111-1111-4111-8111-111111111111";
const S="11111111-2222-4111-8111-111111111111";
const blocked=code=>error=>error instanceof AtlasActionGatewayError&&error.code===code;
const read=path=>readFile(new URL(path,import.meta.url),"utf8");
const action=(id="github.repositories.list",other={})=>planAtlasReadAction({
  workspaceId:W,connectionId:C,actionId:id,surface:"rest",args:{},...other,
});

function harness(overrides={}){
 const steps=[];
 const state={
   role:"member",active:true,grant:true,connection:{
     workspaceId:W,connectionId:C,actorId:U,provider:"github",active:true,revoked:false,
   },...overrides,
 };
 const backend=createAtlasActionGatewayPreflight({
   authenticate:async(session)=>{
     steps.push("auth");
     if(session!=="trusted-session")throw Error("TOKEN_PRIVATE");
     return {verified:true,userId:U,sessionId:S};
   },
   repository:{transaction:async fn=>{
     steps.push("transaction");
     return fn({
       sessionActive:async(userId,sessionId)=>{steps.push("session");return state.active&&userId===U&&sessionId===S;},
       workspaceRole:async()=>{steps.push("workspace");return state.role;},
       connectionForActor:async()=>{steps.push("connection");return state.connection;},
       providerReadGrant:async()=>{steps.push("grant");return state.grant;},
     });
   }},
 });
 return {backend,steps,state};
}
test("catalog has exactly implemented GitHub, Linear, Notion reads and no writes",()=>{
 assert.equal(typeof createAuthorizedGitHubReader,"function");
 assert.equal(LINEAR_READ_PAGE_SIZE,25);
 assert.equal(NOTION_IMPLEMENTED_CAPABILITIES["search.title"].implemented,true);
 assert.deepEqual(ATLAS_ACTION_CATALOG.map(a=>a.id),
   ["github.repositories.list","linear.teams.list","notion.search.title"]);
 assert.ok(ATLAS_ACTION_CATALOG.every(a=>a.risk==="read"&&a.implemented&&
   !a.available&&!a.granted&&!a.callable&&Object.isFrozen(a)));
 assert.equal(ATLAS_ACTION_CATALOG.some(a=>/create|write|rerun|publish|delete|update/.test(a.id)),false);
});
test("REST and MCP catalogs represent the same immutable allowlist and modes",()=>{
 const rest=projectAtlasActionCatalog("rest");
 const mcp=projectAtlasActionCatalog("mcp");
 assert.deepEqual(rest,mcp);
 assert.equal(rest.length,3);
 assert.ok(rest.every(x=>x.available===false&&x.authorized===false&&x.callable===false&&
   x.mode==="read"&&x.inputSchema.additionalProperties===false));
 assert.ok(Object.isFrozen(rest));
 assert.throws(()=>projectAtlasActionCatalog("stdio"),blocked("ATLAS_ACTION_SURFACE_INVALID"));
});
test("REST and MCP normalize identical intent SHA-256 from same scope and args",()=>{
 const rest=action("notion.search.title",{args:{query:"Production"}});
 const mcp=planAtlasMcpTool({
   workspaceId:W,connectionId:C,toolName:"atlas_notion_search_title",arguments:{query:"Production"},
 });
 assert.equal(rest.intentSha256,mcp.intentSha256);
 assert.equal(rest.actionId,mcp.actionId);
 assert.equal(rest.surface,"rest");
 assert.equal(mcp.surface,"mcp");
 assert.equal(rest.provider,"notion");
 assert.equal(mcp.provider,"notion");
 assert.equal(rest.canRead,false);
 assert.equal(mcp.canCall,false);
 assert.ok(Object.isFrozen(rest)&&Object.isFrozen(rest.args));
});
test("no source provider token, raw connection, identity, role, host or URL from untrusted inputs",()=>{
 const request={workspaceId:W,connectionId:C,actionId:"notion.search.title",
   args:{query:"Roadmap"},surface:"mcp"};
 for(const prop of ["token","apiKey","authorization","oauth","host","url","actorId",
  "role","approval","userId","machineId","installationId","provider","permission","risk"]){
  assert.throws(()=>planAtlasReadAction({...request,[prop]:"elevated"}),
    blocked("ATLAS_ACTION_INPUT_INVALID"));
 }
 for(const args of [{query:"hi",connectionRef:"admin"},{url:"https://evil.local"},
   {query:"ok",token:"abc"},{query:"a".repeat(101)},{query:42},
   {query:"hello\nworld"},[],null]){
  assert.throws(()=>planAtlasReadAction({...request,args}),blocked("ATLAS_ACTION_ARGUMENTS_INVALID"));
 }
});
test("unallowlisted HTTP/MCP actions cannot select GitHub Studio writes or arbitrary tools",()=>{
 for(const a of ["github.pull_requests.create","github.actions.rerun","linear.issues.create",
 "notion.pages.create","n8n.workflow.publish","tools/call","provider.read_all"]){
  assert.throws(()=>action(a),blocked("ATLAS_ACTION_NOT_ALLOWLISTED"));
 }
 for(const name of ["atlas_github_actions_rerun","github_create_pr","tools/call","atlas_secret_dump"]){
  assert.throws(()=>planAtlasMcpTool({workspaceId:W,connectionId:C,toolName:name,arguments:{}}),
    blocked("ATLAS_ACTION_NOT_ALLOWLISTED"));
 }
});
test("Notion only accepts bounded title search, GitHub/Linear accept no dynamic query",()=>{
 for(const actionId of ["github.repositories.list","linear.teams.list"]){
  assert.throws(()=>action(actionId,{args:{query:"all"}}),
    blocked("ATLAS_ACTION_ARGUMENTS_INVALID"));
 }
 assert.equal(action("notion.search.title",{args:{query:""}}).args.query,"");
});
test("runtime preflight rechecks session, role, scoped connection, exact grant",async()=>{
 const h=harness();
 const verdict=await h.backend.inspect({session:"trusted-session",plan:action()});
 assert.equal(verdict.actorVerified,true);
 assert.equal(verdict.workspaceMembershipVerified,true);
 assert.equal(verdict.serverGrantChecked,true);
 assert.equal(verdict.canRead,false);
 assert.equal(verdict.canCall,false);
 assert.equal(verdict.credentialShared,false);
 assert.equal(JSON.stringify(verdict).includes(S),false);
 assert.equal(JSON.stringify(verdict).includes(U),false);
 assert.ok(Object.isFrozen(verdict));
 assert.deepEqual(h.steps,["auth","transaction","session","workspace","connection","grant"]);
});
test("session revocation, nonmember and absence of provider grant fail closed",async()=>{
 const states=[
  [{active:false},"ATLAS_ACTION_SESSION_REVOKED"],
  [{role:null},"ATLAS_ACTION_WORKSPACE_FORBIDDEN"],
  [{grant:false},"ATLAS_ACTION_GRANT_FORBIDDEN"],
  [{connection:null},"ATLAS_ACTION_CONNECTION_FORBIDDEN"],
 ];
 for(const [options,code] of states){
  const h=harness(options);
  await assert.rejects(h.backend.inspect({session:"trusted-session",plan:action()}),blocked(code));
  if(code==="ATLAS_ACTION_SESSION_REVOKED"||code==="ATLAS_ACTION_WORKSPACE_FORBIDDEN")
   assert.equal(h.steps.includes("connection"),false);
 }
});
test("forged cross-tenant and wrong provider connection bindings always rejected",async()=>{
 for(const connection of [
  {workspaceId:B,connectionId:C,actorId:U,provider:"github",active:true},
  {workspaceId:W,connectionId:C,actorId:B,provider:"github",active:true},
  {workspaceId:W,connectionId:C,actorId:U,provider:"linear",active:true},
  {workspaceId:W,connectionId:B,actorId:U,provider:"github",active:true},
  {workspaceId:W,connectionId:C,actorId:U,provider:"github",active:false},
  {workspaceId:W,connectionId:C,actorId:U,provider:"github",active:true,revoked:true},
 ]){
  const h=harness({connection});
  await assert.rejects(h.backend.inspect({session:"trusted-session",plan:action()}),
   blocked("ATLAS_ACTION_CONNECTION_FORBIDDEN"));
 }
});
test("preflight rejects forged provider/tool/digest even with a valid user and grant",async()=>{
 const h=harness();
 for(const changes of [
  {provider:"linear"},{toolName:"atlas_linear_teams_list"},{intentSha256:"a".repeat(64)},
  {canRead:true},{canWrite:true},{authorized:true},{credentialShared:true},{risk:"write"},
  {args:{query:"*"}},{surface:"stdio"},
 ]){
  await assert.rejects(h.backend.inspect({session:"trusted-session",
    plan:{...action(),...changes}}),blocked("ATLAS_ACTION_UNTRUSTED_PLAN"));
 }
 assert.deepEqual(h.steps,[],"invalid plans rejected before auth");
});
test("invalid or untrusted auth and backend failure never trigger execution",async()=>{
 assert.throws(()=>createAtlasActionGatewayPreflight({}),
   blocked("ATLAS_ACTION_BACKEND_UNAVAILABLE"));
 const h=harness();
 await assert.rejects(h.backend.inspect({session:"forged",plan:action()}),
   blocked("ATLAS_ACTION_AUTH_REQUIRED"));
 const backend=createAtlasActionGatewayPreflight({
  authenticate:async()=>({verified:true,userId:U,sessionId:S}),
  repository:{transaction:async()=>{throw Error("DATABASE_SECRET_CONN");}},
 });
 await assert.rejects(backend.inspect({session:"trusted-session",plan:action()}),
   blocked("ATLAS_ACTION_BACKEND_UNAVAILABLE"));
});
test("no HTTP dispatch or MCP tools/call can be executed, even after granted preflight",async()=>{
 const h=harness();
 await h.backend.inspect({session:"trusted-session",plan:action()});
 await assert.rejects(h.backend.call(),e=>blocked("ATLAS_ACTION_GATEWAY_NOT_RELEASED")(e)&&e.status===423);
 await assert.rejects(h.backend.toolsCall(),blocked("ATLAS_ACTION_GATEWAY_NOT_RELEASED"));
});
test("catalog BFF is session-scoped, no fake live rights or provider secrets",async()=>{
 const route=await read("../src/app/api/actions/catalog/route.ts");
 assert.match(route,/requireEngineWorkspace\(workspaceId\)/);
 assert.match(route,/params\.getAll\("workspaceId"\)\.length !== 1/);
 assert.match(route,/params\.getAll\("surface"\)\.length > 1/);
 assert.match(route,/providerConnected: false/);
 assert.match(route,/machineAuthEnabled: false/);
 assert.match(route,/gatewayReleased: false/);
 assert.match(route,/CATALOG_ONLY_NO_PROVIDER_IO/);
 assert.doesNotMatch(route,/export async function POST|SUPABASE_SERVICE_ROLE|API_KEY|OAuth|createAuthorizedGitHubReader|fetch\(/);
});
test("gateway core cannot mint provider tokens nor call external URLs",async()=>{
 const core=await read("../packages/action-gateway/src/catalog.mjs");
 assert.doesNotMatch(core,/\bfetch\s*\(|\baxios\s*\(|\bspawn\s*\(|\bexec\s*\(/);
 assert.doesNotMatch(core,/NEXT_PUBLIC_|process\.env|service_role|Authorization: Bearer/i);
 assert.match(core,/ATLAS_ACTION_GATEWAY_NOT_RELEASED/);
});
