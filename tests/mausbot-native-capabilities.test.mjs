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
  id:"skills.bot.read",transport:"http",method:"GET",path:"/api/bots/bot-1/skills/good-slug",permission:"sensitive",callable:false,implementation:"adapter-mock-tested"
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

test("Offline adapters and mutation plans stay strictly non-callable across source families",()=>{
 const sum=nativeCoverageSummary();
 assert.equal(sum.mockTestedReads,21);
 assert.equal(sum.validatedMutationPlans,37);
 assert.equal(sum.callable,0);
 assert.equal(sum.testedLive,0);
 for(const p of MAUSBOT_NATIVE_CAPABILITIES){
  if(p.implementation==="adapter-mock-tested" || p.implementation==="validated-plan"){
   assert.equal(p.callable,false);assert.equal(p.hostTested,false);
  }
 }
});

test("Team + channel work is registered as offline-only implementation progress", () => {
  const readIds = ["teams.library.catalog", "teams.organization.catalog"];
  const plannedIds = ["teams.export", "teams.import", "teams.organization.install", "channels.mark-read",
    "channels.queue.cancel", "channels.queue.steer", "channels.members.compact", "channels.tasks.delete"];
  for (const id of readIds) {
    const found = nativePrimitive(id);
    assert.equal(found?.implementation, "adapter-mock-tested");
    assert.equal(found?.callable, false);
    assert.equal(found?.hostTested, false);
  }
  for (const id of plannedIds) {
    const found = nativePrimitive(id);
    assert.equal(found?.implementation, "validated-plan");
    assert.equal(found?.callable, false);
    assert.equal(found?.hostTested, false);
  }
  const summary = nativeCoverageSummary();
  assert.equal(summary.mockTestedReads, 21);
  assert.equal(summary.validatedMutationPlans, 37);
  assert.equal(summary.total, 128);
  assert.equal(summary.callable, 0);
  assert.equal(summary.testedLive, 0);
});

test("MCP and OAuth offline adapters preserve the preconnection release boundary", () => {
  const reads = ["mcp.bot-servers.list","mcp.team.connections","connectors.catalog","connectors.connected"];
  const plans = ["mcp.bot-servers.test","mcp.bot-servers.toggle","mcp.bot-servers.sign-in",
    "mcp.bot-servers.sign-out","mcp.bot-servers.sign-in.cancel","mcp.team.connection-scopes",
    "mcp.team.sign-in","mcp.team.disconnect","connectors.user.apps.connect",
    "connectors.user.apps.disconnect"];
  for(const id of reads) assert.equal(nativePrimitive(id)?.implementation, "adapter-mock-tested",id);
  for(const id of plans) assert.equal(nativePrimitive(id)?.implementation,"validated-plan",id);
  const total = nativeCoverageSummary();
  assert.equal(total.total,128);
  assert.equal(total.mockTestedReads,17);
  assert.equal(total.validatedMutationPlans,29);
  assert.equal(total.callable,0);
  assert.equal(total.testedLive,0);
});

test("Event, routine and webhook family coverage remains offline-only",()=>{
  const reads=["webhooks.list","routines.list","notifications.list","jobs.snapshot"];
  const mutations=["webhooks.test","webhooks.rotate","webhooks.update","webhooks.delete",
    "routines.update","routines.run","notifications.read","notifications.read-all"];
  for(const id of reads) {
    const p=nativePrimitive(id); assert.equal(p?.implementation,"adapter-mock-tested");
    assert.equal(p.callable,false);assert.equal(p.hostTested,false);
  }
  for(const id of mutations){
    const p=nativePrimitive(id);assert.equal(p?.implementation,"validated-plan");
    assert.equal(p.callable,false);assert.equal(p.hostTested,false);
  }
  const summary=nativeCoverageSummary();
  assert.equal(summary.total,128);
  assert.equal(summary.mockTestedReads,21);
  assert.equal(summary.validatedMutationPlans,37);
  assert.equal(summary.testedLive,0);
  assert.equal(summary.callable,0);
});
