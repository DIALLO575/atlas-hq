import test from "node:test";
import assert from "node:assert/strict";
import { nativePrimitive, MAUSBOT_NATIVE_CAPABILITIES } from "../packages/engine-core/src/native-capabilities.mjs";
import { MAUSBOT_MCP_SURFACES, MCP_CONNECTOR_READS, MCP_CONNECTOR_MUTATION_PLANS,
  McpConnectorInputError, planMcpConnectorRead, executeMcpConnectorRead,
  planMcpConnectorMutation } from "../packages/engines/mausbot/src/mcp-connectors.mjs";
const config={baseUrl:"https://maus.example.test",token:"BEARER_PRIVATE"};
const fixtures={
  "/api/mcp/servers":{servers:[
    {name:"notion",type:"http",url:"https://mcp.example.test?secret=PRIVATE",
      headerKeys:["Authorization"],auth:{state:"signed-in",accessToken:"PRIVATE"},
      oauth:{clientId:"PRIVATE",clientSecretConfigured:true},enabled:true,hasApps:true},
    {name:"local",command:"bash PRIVATE",args:["--token","PRIVATE"],
      envKeys:["SECRET_KEY"],enabled:false},
  ],extra:"PRIVATE"},
  "/api/team/my-connections":{team:{id:"PRIVATE",name:"Team"},link:"https://PRIVATE",
    email:"private@example.test",apps:[{slug:"gmail",connected:true,
      accounts:[{id:"ca_PRIVATE",alias:"PRIVATE",status:"ACTIVE"}]}],
    mcp:[{name:"notion",host:"private.example",connected:true,how:"sign-in",key:"PRIVATE"}]},
  "/api/connectors/catalog":{configured:true,cards:[{slug:"gmail",label:"Gmail",
    logo:"https://PRIVATE",domain:"PRIVATE",url:"PRIVATE",blurb:"PRIVATE"}],secret:"PRIVATE"},
  "/api/connectors/connected":{configured:true,credentialStore:"PRIVATE",services:{
    gmail:{connected:true,pending:false,status:"ACTIVE",secret:"PRIVATE",
      accounts:[{id:"ca_PRIVATE",alias:"PRIVATE",status:"ACTIVE",refreshToken:"PRIVATE"}]},
    slack:{connected:false,pending:true,status:"PENDING",accounts:[]},
  }},
};
const network=(calls,override={})=>async(url,init)=>{
  const path=new URL(url).pathname;
  calls.push({path,method:init.method,headers:init.headers,redirect:init.redirect});
  const obj=Object.hasOwn(override,path)?override[path]:fixtures[path];
  return obj===undefined?Response.json({error:"missing"}, {status:404}):Response.json(obj);
};
test("Three different MCP surfaces cannot be confused and internal bridge is never public",()=>{
  assert.deepEqual(MAUSBOT_MCP_SURFACES.map(x=>x.id),
    ["external-control","agent-tools","internal-bridge"]);
  assert.equal(MAUSBOT_MCP_SURFACES.find(x=>x.id==="internal-bridge").exposure,"never-public");
  assert.equal(new Set(MAUSBOT_MCP_SURFACES.map(x=>x.id)).size,3);
});
for(const name of MCP_CONNECTOR_READS){
  test(name+" reads the official route and strips all secrets and account identities",async()=>{
    const calls=[];
    const plan=planMcpConnectorRead(name);
    const result=await executeMcpConnectorRead(config,name,{fetchImpl:network(calls)});
    assert.equal(plan.path,calls[0].path);
    assert.equal(calls[0].method,"GET");
    assert.equal(calls[0].redirect,"manual");
    assert.equal(calls[0].headers.Authorization,"Bearer BEARER_PRIVATE");
    assert.equal(result.primitive,name);
    assert.equal(result.projection,"metadata-only");
    for(const value of ["PRIVATE","BEARER_PRIVATE","private@example","ca_PRIVATE","https://"]) {
      assert.equal(JSON.stringify(result).includes(value),false,name+" leaked "+value);
    }
    assert.equal(plan.callable,false);
    assert.equal(plan.released,false);
    assert.equal(plan.hostTested,false);
    assert.equal(nativePrimitive(name).method,"GET");
  });
}
test("Known public metadata is useful without copying OAuth and provider response shapes",async()=>{
  const mcp=await executeMcpConnectorRead(config,"mcp.bot-servers.list",{fetchImpl:network([])});
  assert.deepEqual(mcp.servers.map(x=>[x.name,x.transport,x.enabled]),
    [["notion","http",true],["local","stdio",false]]);
  const team=await executeMcpConnectorRead(config,"mcp.team.connections",{fetchImpl:network([])});
  assert.deepEqual(team.apps,[{slug:"gmail",connected:true,accountCount:1}]);
  assert.deepEqual(team.mcp,[{name:"notion",connected:true,method:"oauth"}]);
  const connected=await executeMcpConnectorRead(config,"connectors.connected",{fetchImpl:network([])});
  assert.equal(connected.services.gmail.accountCount,1);
  assert.equal(connected.services.gmail.activeCount,1);
  assert.equal(connected.services.slack.pending,true);
  const cards=await executeMcpConnectorRead(config,"connectors.catalog",{fetchImpl:network([])});
  assert.deepEqual(cards.cards,[{slug:"gmail",label:"Gmail"}]);
});
test("Malformed upstream lists and account inventory fail closed",async()=>{
  for(const [name,path,value] of [
    ["mcp.bot-servers.list","/api/mcp/servers",{servers:{name:"not-list"}}],
    ["mcp.team.connections","/api/team/my-connections",{apps:[],mcp:{}}],
    ["connectors.catalog","/api/connectors/catalog",{cards:[{slug:"bad/slug",label:"Bad"}]}],
    ["connectors.connected","/api/connectors/connected",{services:{"../../escape":{connected:true}}}],
  ]) {
    await assert.rejects(
      executeMcpConnectorRead(config,name,{fetchImpl:network([],{[path]:value})}),
      (e)=>e.code==="MCP_CONNECTOR_RESPONSE_INVALID",name);
  }
  assert.throws(()=>planMcpConnectorRead("mcp.bot-servers.sign-in"),McpConnectorInputError);
});
const cases=[
  ["mcp.bot-servers.test",{serverName:"notion"},"POST","/api/mcp/servers/notion/test",undefined],
  ["mcp.bot-servers.toggle",{serverName:"notion",enabled:false},"PATCH","/api/mcp/servers/notion",{enabled:false}],
  ["mcp.bot-servers.sign-in",{serverName:"notion"},"POST","/api/mcp/servers/notion/sign-in",undefined],
  ["mcp.bot-servers.sign-out",{serverName:"notion"},"POST","/api/mcp/servers/notion/sign-out",undefined],
  ["mcp.bot-servers.sign-in.cancel",{
    serverName:"notion",flowId:"11111111-2222-4333-8444-555555555555"},
    "DELETE","/api/mcp/servers/notion/sign-in/11111111-2222-4333-8444-555555555555",undefined],
  ["mcp.team.connection-scopes",{kind:"mcp",id:"notion",scope:"person"},
    "PUT","/api/team/connection-scopes",{kind:"mcp",id:"notion",scope:"person"}],
  ["mcp.team.sign-in",{serverName:"notion"},"POST",
    "/api/team/my-connections/mcp/notion/sign-in",undefined],
  ["mcp.team.disconnect",{serverName:"notion"},"DELETE",
    "/api/team/my-connections/mcp/notion",undefined],
  ["connectors.user.apps.connect",{appSlug:"gmail"},"POST",
    "/api/team/my-connections/apps/gmail/connect",undefined],
  ["connectors.user.apps.disconnect",{appSlug:"gmail"},"DELETE",
    "/api/team/my-connections/apps/gmail",undefined],
];
test("Ten MCP/OAuth plans match actual HTTP verbs and never permit network execution",()=>{
  assert.equal(MCP_CONNECTOR_MUTATION_PLANS.length,10);
  assert.equal(new Set(MCP_CONNECTOR_MUTATION_PLANS).size,10);
  for(const [name,input,method,path,body] of cases){
    const plan=planMcpConnectorMutation(name,input);
    assert.equal(nativePrimitive(name).method,method);
    assert.equal(plan.method,method);
    assert.equal(plan.path,path);
    assert.deepEqual(plan.body,body);
    assert.equal(plan.requiresHumanApproval,true);
    assert.equal(plan.requiresRealActorSession,true);
    assert.equal(plan.requiresWorkspaceAuthorization,true);
    assert.equal(plan.requiresRuntimePolicyCheck,true);
    assert.equal(plan.requiresDurableAudit,true);
    assert.equal(plan.rawOAuthOrKeyAllowed,false);
    assert.equal(plan.retryPolicy,"never-automatic");
    assert.equal(plan.callable,false);
    assert.equal(plan.hostTested,false);
    assert.equal(plan.released,false);
  }
});
test("Unknown fields, tokens, callbacks, arbitrary URLs, internal bridge, invalid identities fail closed",()=>{
  const bad=[
    ["mcp.bot-servers.sign-in",{serverName:"notion",callbackUrl:"https://evil"}],
    ["mcp.bot-servers.test",{serverName:"../other"}],
    ["mcp.bot-servers.toggle",{serverName:"notion",enabled:true,approved:true}],
    ["mcp.bot-servers.toggle",{serverName:"notion",enabled:"true"}],
    ["mcp.bot-servers.sign-in.cancel",{serverName:"notion",flowId:"not-uuid"}],
    ["mcp.team.connection-scopes",{kind:"mcp",id:"notion",scope:"admin"}],
    ["mcp.team.connection-scopes",{kind:"app",id:"../../bad",scope:"person"}],
    ["mcp.team.sign-in",{serverName:"notion",token:"PRIVATE"}],
    ["mcp.team.disconnect",{serverName:"notion",key:"PRIVATE"}],
    ["connectors.user.apps.connect",{appSlug:"gmail",url:"https://evil"}],
    ["connectors.user.apps.disconnect",{appSlug:"gmail",force:true}],
    ["mcp.bot-servers.create",{name:"evil",command:"sh"}],
    ["mcp.bot-servers.import",{json:"{}"}],
    ["mcp.team.key",{serverName:"notion",value:"PRIVATE"}],
    ["mcp.bot-servers.sign-in.status",{serverName:"notion",flowId:"abc"}],
  ];
  for(const [name,payload] of bad) {
    assert.throws(()=>planMcpConnectorMutation(name,payload),McpConnectorInputError,name);
  }
});
test("Native registry never exposes new MCP/OAuth operations as callable",()=>{
  assert.equal(MCP_CONNECTOR_READS.length,4);
  for(const name of [...MCP_CONNECTOR_READS,...MCP_CONNECTOR_MUTATION_PLANS]){
    const p=MAUSBOT_NATIVE_CAPABILITIES.find(x=>x.id===name);
    assert.ok(p,name);assert.equal(p.callable,false);assert.equal(p.hostTested,false);
  }
});
