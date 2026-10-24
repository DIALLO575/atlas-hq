import test from "node:test";
import assert from "node:assert/strict";
import { NATIVE_MUTATION_PLANS, planMausbotNativeMutation } from "../packages/engines/mausbot/src/native-mutation-plans.mjs";
import { nativePrimitive } from "../packages/engine-core/src/native-capabilities.mjs";

const H = "a".repeat(64);
const cases = [
  ["memory.bot.write-index", {botId:"bot-1",text:"safe draft"}, "/api/bots/bot-1/memory", "PUT", {text:"safe draft"}],
  ["memory.bot.write-file", {botId:"bot-1",path:"memory/notes.md",text:"a",expectedHash:H},
   "/api/bots/bot-1/memory/file", "PUT", {path:"memory/notes.md",text:"a",expectedHash:H}],
  ["memory.bot.delete-file", {botId:"bot-1",path:"memory/log/day.md"}, "/api/bots/bot-1/memory/file", "DELETE", {}],
  ["memory.bot.reviewed", {botId:"bot-1",token:H}, "/api/bots/bot-1/memory/reviewed", "POST", {token:H}],
  ["memory.bot.tidy", {botId:"bot-1"}, "/api/bots/bot-1/memory/tidy", "POST", {}],
  ["skills.bot.update", {botId:"bot-1",skillId:"task-manager",enabled:false},
   "/api/bots/bot-1/skills/task-manager", "PATCH", {enabled:false}],
  ["skills.library.update", {skillId:"task-manager",enabled:true},
   "/api/skills-library/task-manager", "PATCH", {enabled:true}],
  ["skills.bot.library-update", {botId:"bot-1",skills:["task-manager"]},
   "/api/bots/bot-1/skills-library", "PUT", {skills:["task-manager"]}],
  ["memory.team.patch-entry", {entryId:"note-1",section:"core",expectedRevision:"v3",name:"policy"},
   "/api/team-memory/note-1", "PATCH", {expectedRevision:"v3",name:"policy"}],
  ["memory.team.delete-entry", {entryId:"note-1",section:"core",expectedRevision:"v3"},
   "/api/team-memory/note-1", "DELETE", {}],
  ["memory.section.update", {section:"core",text:"safe draft"}, "/api/section-context", "PUT", {text:"safe draft"}],
];
test("Eleven mutation plans cover source methods, never grant execution",()=>{
 assert.equal(NATIVE_MUTATION_PLANS.length,11);
 assert.equal(new Set(NATIVE_MUTATION_PLANS).size,11);
 for(const [name,input,route,verb,body] of cases){
  assert.ok(nativePrimitive(name),name+" absent from catalog");
  const planned=planMausbotNativeMutation(name,input);
  assert.equal(planned.method,verb,name);
  assert.equal(planned.path.split("?")[0],route,name);
  assert.deepEqual(planned.body,body,name);
  assert.equal(planned.requiresHumanApproval,true);
  assert.equal(planned.requiresDurableAudit,true);
  assert.equal(planned.requiresOwnerOrAdmin,true);
  assert.equal(planned.callable,false);
  assert.equal(planned.released,false);
  assert.equal(planned.hostTested,false);
 }
});
test("Memory paths, team revision and query encoding respect the original routes",()=>{
 const file=planMausbotNativeMutation("memory.bot.delete-file",{botId:"bot-1",path:"memory/log/day.md"});
 assert.equal(new URL("https://local.test"+file.path).searchParams.get("path"),"memory/log/day.md");
 assert.equal(file.retryPolicy,"never-auto");
 const team=planMausbotNativeMutation("memory.team.delete-entry",{entryId:"note-1",section:"Team Ops",expectedRevision:"v3"});
 const url=new URL("https://local.test"+team.path);
 assert.equal(url.searchParams.get("section"),"Team Ops");
 assert.equal(url.searchParams.get("revision"),"v3");
 assert.equal(team.retryPolicy,"never-auto");
 assert.equal(planMausbotNativeMutation("memory.team.patch-entry",{
  entryId:"note-1",section:"core",expectedRevision:"v3",accept:true,
 }).body.accept,true);
});
test("Mutation planning never accepts a browser-provided approval flag or admin policy bypass",()=>{
 const invalid=[
  ["skills.bot.update",{botId:"bot-1",skillId:"task-manager",enabled:true,approved:true}],
  ["memory.section.update",{section:"core",text:"x",approvalMode:"full"}],
  ["memory.bot.delete-file",{botId:"bot-1",path:"../../secret"}],
  ["memory.bot.write-file",{botId:"bot-1",path:"MEMORY.md",text:"x",expectedHash:"not-a-hash"}],
  ["memory.bot.write-file",{botId:"bot-1",path:"/etc/passwd",text:"x",expectedHash:H}],
  ["memory.team.patch-entry",{entryId:"note-1",section:"core",expectedRevision:"v3"}],
  ["memory.team.delete-entry",{entryId:"note-1",section:"core"}],
  ["memory.bot.reviewed",{botId:"bot-1",token:"short"}],
  ["skills.bot.library-update",{botId:"bot-1",skills:["same","same"]}],
  ["skills.bot.update",{botId:"bot-1",skillId:"invalid/name",enabled:true}],
  ["memory.bot.tidy",{botId:"bot-1",admin:true}],
  ["computer.local.run",{target:"host"}],
 ];
 for(const [name,input] of invalid) assert.throws(()=>planMausbotNativeMutation(name,input),undefined,name);
});
test("Section context enforces upstream 24 KB byte limit, including multibyte text",()=>{
 assert.throws(()=>planMausbotNativeMutation("memory.section.update",{section:"general",text:"é".repeat(13000)}));
 assert.doesNotThrow(()=>planMausbotNativeMutation("memory.section.update",{section:"general",text:"é".repeat(12000)}));
});
