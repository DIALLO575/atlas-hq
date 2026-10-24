import test from "node:test";
import assert from "node:assert/strict";
import {MAUSBOT_NATIVE_CAPABILITIES,MAUSBOT_NATIVE_FAMILIES,MAUSBOT_SOURCE_REVISION,planNativePrimitive,nativePrimitive,nativeCoverageSummary} from "../packages/engine-core/src/native-capabilities.mjs";
import {MAUSBOT_PRIMITIVES} from "../packages/engine-core/src/primitives.mjs";

test("Native contract covers independently verified route families, not just 20 MCP tools",()=>{
 assert.ok(MAUSBOT_NATIVE_CAPABILITIES.length>=100);
 assert.ok(MAUSBOT_NATIVE_FAMILIES.length>=10);
 assert.equal(MAUSBOT_PRIMITIVES.length,20);
 assert.equal(new Set(MAUSBOT_NATIVE_CAPABILITIES.map(p=>p.id)).size,MAUSBOT_NATIVE_CAPABILITIES.length);
 assert.equal(MAUSBOT_SOURCE_REVISION,"0a78caa91a64c1ab1adfa972ab4e540e89b66c6d");
 for(const p of MAUSBOT_NATIVE_CAPABILITIES){
  assert.match(p.source,/^(server\/routes\/|scripts\/|src\/|docs\/|companion\/)/);
  assert.equal(p.callable,false);
  assert.equal(p.hostTested,false);
  assert.equal(p.secretPolicy,"deny-raw-results");
  assert.ok(["GET","POST","PUT","PATCH","DELETE"].includes(p.method));
  assert.ok(p.route.startsWith("/api/"));
 }
});
test("Route plans accept only path parameters and never arbitrary API URLs",()=>{
 assert.deepEqual(planNativePrimitive("skills.bot.read",{botId:"bot-1",skillId:"good-slug"}),{
  id:"skills.bot.read",transport:"http",method:"GET",path:"/api/bots/bot-1/skills/good-slug",permission:"sensitive",callable:false,implementation:"contract-only"
 });
 for(const candidate of ["../secret","foo/bar","a%2Fb","..","foo?x=1"])
 assert.throws(()=>planNativePrimitive("memory.bot.read-file",{botId:candidate}),/NATIVE_ID_INVALID/);
 assert.throws(()=>planNativePrimitive("webhooks.delete",{webhookId:"ok",baseUrl:"https://attacker"}),/NATIVE_PARAMS_INVALID/);
 assert.throws(()=>planNativePrimitive("webhooks.delete",{}),/NATIVE_PARAMS_INVALID/);
 assert.throws(()=>planNativePrimitive("unknown",{}),/NATIVE_PRIMITIVE_UNKNOWN/);
});
test("Admin/approval/browser primitives never become callable in the preconnection catalogue",()=>{
 for(const id of ["mcp.bot-servers.import","webhooks.rotate","computer.local.run","agents.permissions.always-allow","memory.bot.tidy"]){
  const p=nativePrimitive(id); assert.ok(p); assert.equal(p.callable,false);
 }
 const coverage=nativeCoverageSummary(); assert.equal(coverage.callable,0);assert.equal(coverage.testedLive,0);
 assert.ok(coverage.restricted>10);assert.equal(coverage.total,MAUSBOT_NATIVE_CAPABILITIES.length);
});

test("Native source-mapped team memory and skill editing use actual HTTP verbs",()=>{
 const expected=[["memory.team.patch-entry","PATCH"],["memory.team.delete-entry","DELETE"],["skills.bot.import","POST"],["skills.bot.update","PATCH"],["skills.bot.delete","DELETE"],["skills.library.add","POST"],["skills.library.update","PATCH"]];
 for(const [name,method] of expected){const p=nativePrimitive(name);assert.ok(p,name);assert.equal(p.method,method);assert.equal(p.callable,false)}
});
