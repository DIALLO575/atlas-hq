import { mausbotRequest, MausbotAdapterError } from "./adapter.mjs";
import { nativePrimitive, planNativePrimitive } from "../../../engine-core/src/native-capabilities.mjs";

/** External stdio control, inbound tools and internal per-turn MCP are DISTINCT. */
export const MAUSBOT_MCP_SURFACES = Object.freeze([
  Object.freeze({ id: "external-control", transport: "mcp-stdio", exposure: "operator-worker", status: "contract-only" }),
  Object.freeze({ id: "agent-tools", transport: "http-config-and-mcp-runtime", exposure: "tenant-scoped", status: "offline-contracts" }),
  Object.freeze({ id: "internal-bridge", transport: "mcp-streamable-http", exposure: "never-public", status: "restricted" }),
]);
export const MCP_CONNECTOR_READS = Object.freeze([
  "mcp.bot-servers.list", "mcp.team.connections", "connectors.catalog", "connectors.connected",
]);
export const MCP_CONNECTOR_MUTATION_PLANS = Object.freeze([
  "mcp.bot-servers.test", "mcp.bot-servers.toggle",
  "mcp.bot-servers.sign-in", "mcp.bot-servers.sign-out",
  "mcp.bot-servers.sign-in.cancel", "mcp.team.connection-scopes",
  "mcp.team.sign-in", "mcp.team.disconnect",
  "connectors.user.apps.connect", "connectors.user.apps.disconnect",
]);
export class McpConnectorInputError extends Error {
  constructor(code) { super(code); this.code = code; this.status = 400; this.name = "McpConnectorInputError"; }
}
const fail = code => { throw new McpConnectorInputError(code); };
const object = v => v !== null && typeof v === "object" && !Array.isArray(v);
const nameOK = v => typeof v === "string" && /^[a-z][a-z0-9_-]{0,31}$/.test(v);
const appOK = v => typeof v === "string" && /^[a-z0-9][a-z0-9_-]{0,63}$/.test(v);
const flowOK = v => typeof v === "string" && /^[a-f0-9-]{36}$/.test(v);
const str = (v, n=100) => typeof v === "string" ? v.slice(0,n) : null;
function asObject(v) {
  if (!object(v)) throw new MausbotAdapterError("MCP_CONNECTOR_RESPONSE_INVALID",502);
  return v;
}
function asArray(v, max=100) {
  if (!Array.isArray(v) || v.length > max) throw new MausbotAdapterError("MCP_CONNECTOR_RESPONSE_INVALID",502);
  return v;
}
function fields(input, allowed, required=allowed) {
  if (!object(input)) fail("MCP_CONNECTOR_INPUT_INVALID");
  if (Object.keys(input).some(k=>!allowed.includes(k))) fail("MCP_CONNECTOR_FIELD_FORBIDDEN");
  if (required.some(k=>!Object.hasOwn(input,k))) fail("MCP_CONNECTOR_FIELD_MISSING");
}
function mapped(name, ids={}) {
  try { return planNativePrimitive(name,ids).path; }
  catch { return fail("MCP_CONNECTOR_PATH_INVALID"); }
}
export function planMcpConnectorRead(name) {
  if (!MCP_CONNECTOR_READS.includes(name) || nativePrimitive(name)?.method !== "GET") fail("MCP_READ_UNKNOWN");
  return Object.freeze({primitive:name,path:mapped(name),method:"GET",projection:"metadata-only",
    callable:false,hostTested:false,released:false});
}
function mcpServer(row) {
  const v=asObject(row);
  if(!nameOK(v.name)) throw new MausbotAdapterError("MCP_CONNECTOR_RESPONSE_INVALID",502);
  const a=object(v.auth)?v.auth:{};
  return {name:v.name,transport:"command" in v?"stdio":v.type==="sse"?"sse":"http",
    enabled:v.enabled===true,apps:v.apps!==false,runsElsewhere:object(v.runsOn),
    hasApps:v.hasApps===true,
    requiresSignIn:a.state==="needs-sign-in"||a.status==="needs-sign-in",
    signedIn:a.state==="signed-in"||a.status==="signed-in"};
}
function card(row) {
  const v=asObject(row);
  if(!appOK(v.slug)) throw new MausbotAdapterError("MCP_CONNECTOR_RESPONSE_INVALID",502);
  return {slug:v.slug,label:str(v.label,120)};
}
function accountStatus(row) {
  const v=asObject(row),accounts=asArray(v.accounts??[],100);
  return {connected:v.connected===true,pending:v.pending===true,status:str(v.status,32),
    accountCount:accounts.length,activeCount:accounts.filter(x=>object(x)&&x.status==="ACTIVE").length};
}
/** No raw urls, commands, OAuth codes, emails, aliases, tokens, client IDs or headers. */
export async function executeMcpConnectorRead(config,name,deps={}) {
  const plan=planMcpConnectorRead(name);
  const v=asObject(await mausbotRequest(config,plan.path,deps));
  const header={primitive:name,projection:"metadata-only",untrusted:true};
  switch(name) {
    case "mcp.bot-servers.list":
      return {...header,servers:asArray(v.servers,100).map(mcpServer)};
    case "mcp.team.connections":
      return {...header,
        apps:asArray(v.apps,200).map(x=>{
          const a=asObject(x);
          if(!appOK(a.slug)) throw new MausbotAdapterError("MCP_CONNECTOR_RESPONSE_INVALID",502);
          return {slug:a.slug,connected:a.connected===true,accountCount:asArray(a.accounts??[],100).length};
        }),
        mcp:asArray(v.mcp,100).map(x=>{
          const m=asObject(x);
          if(!nameOK(m.name)) throw new MausbotAdapterError("MCP_CONNECTOR_RESPONSE_INVALID",502);
          return {name:m.name,connected:m.connected===true,
            method:m.how==="sign-in"?"oauth":m.how==="key"?"key":null};
        })};
    case "connectors.catalog":
      return {...header,configured:v.configured===true,cards:asArray(v.cards,500).map(card)};
    case "connectors.connected":{
      const srv=asObject(v.services);
      if(Object.keys(srv).length>500) throw new MausbotAdapterError("MCP_CONNECTOR_RESPONSE_INVALID",502);
      return {...header,configured:v.configured===true,
        services:Object.fromEntries(Object.entries(srv).map(([slug,entry])=>{
          if(!appOK(slug)) throw new MausbotAdapterError("MCP_CONNECTOR_RESPONSE_INVALID",502);
          return [slug,accountStatus(entry)];
        }))};
    }
    default:fail("MCP_READ_UNKNOWN");
  }
}
/** Plans are offline, cannot be invoked via ATLAS BFF. Consent is a separate durable HUMAN workflow. */
export function planMcpConnectorMutation(name,input={}) {
  if(!MCP_CONNECTOR_MUTATION_PLANS.includes(name)) fail("MCP_ACTION_UNKNOWN");
  const source=nativePrimitive(name);
  if(!source || source.method==="GET") fail("MCP_SOURCE_MISMATCH");
  let ids={},body;
  switch(name) {
    case "mcp.bot-servers.test":
    case "mcp.bot-servers.sign-in":
    case "mcp.bot-servers.sign-out":
    case "mcp.team.sign-in":
    case "mcp.team.disconnect":
      fields(input,["serverName"]);
      if(!nameOK(input.serverName)) fail("MCP_SERVER_NAME_INVALID");
      ids={serverName:input.serverName};break;
    case "mcp.bot-servers.toggle":
      fields(input,["serverName","enabled"]);
      if(!nameOK(input.serverName)||typeof input.enabled!=="boolean") fail("MCP_TOGGLE_INVALID");
      ids={serverName:input.serverName};body={enabled:input.enabled};break;
    case "mcp.bot-servers.sign-in.cancel":
      fields(input,["serverName","flowId"]);
      if(!nameOK(input.serverName)||!flowOK(input.flowId)) fail("MCP_FLOW_INVALID");
      ids={serverName:input.serverName,flowId:input.flowId};break;
    case "mcp.team.connection-scopes":
      fields(input,["kind","id","scope"]);
      if(!["mcp","app"].includes(input.kind)||!["team","person"].includes(input.scope)||
        !(input.kind==="mcp"?nameOK(input.id):appOK(input.id))) fail("MCP_SCOPE_INVALID");
      body={kind:input.kind,id:input.id,scope:input.scope};break;
    case "connectors.user.apps.connect":
    case "connectors.user.apps.disconnect":
      fields(input,["appSlug"]);
      if(!appOK(input.appSlug)) fail("MCP_APP_INVALID");
      ids={appSlug:input.appSlug};break;
    default:fail("MCP_ACTION_UNKNOWN");
  }
  return Object.freeze({primitive:name,method:source.method,path:mapped(name,ids),
    ...(body===undefined?{}:{body:Object.freeze(body)}),
    requiresHumanApproval:true,requiresWorkspaceAuthorization:true,
    requiresRealActorSession:true,requiresDurableAudit:true,requiresRuntimePolicyCheck:true,
    retryPolicy:"never-automatic",rawOAuthOrKeyAllowed:false,
    callable:false,hostTested:false,released:false});
}
