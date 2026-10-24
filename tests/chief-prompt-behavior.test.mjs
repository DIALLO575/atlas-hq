import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";
import test from "node:test";

const raw = await readFile(new URL("../src/lib/chief/briefing.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(raw, { compilerOptions: {
  module: ts.ModuleKind.CommonJS,
  target: ts.ScriptTarget.ES2022,
}}).outputText;
const exports = {};
vm.runInNewContext(compiled, {exports});
const {classifyChiefPrompt, buildChiefReply} = exports;

test("Chief recognizes everyday French prompts, plurals and accents",()=>{
  for (const [text,expected] of [
    ["Fais le point sur mes missions","briefing"],
    ["Quelles décisions m'attendent ?","decisions"],
    ["Montre la répartition des missions","activity"],
    ["Liste mes missions prioritaires","missions"],
    ["Montre mes dépôts GitHub et mes PR","github"],
    ["Que sais-tu de ma semaine ?","briefing"],
    ["Bonjour Chief","help"],
  ]) assert.equal(classifyChiefPrompt(text),expected,text);
});

test("Chief replies come entirely from scoped operational records, no imaginary data",()=>{
  const missions=[
    {id:"m1",title:"Intégrer Atlas",status:"active",priority:"high",updatedAt:"2026-10-23T11:00:00Z"},
    {id:"m2",title:"Valider une version",status:"review",priority:"normal",updatedAt:"2026-10-22T10:00:00Z"},
  ];
  const reviews=[{id:"r1",title:"Valider une version",decision:"pending",
    requestedBy:"other",createdAt:"2026-10-23T12:00:00Z"}];
  const owner=buildChiefReply("Quelles décisions m'attendent ?","Equipe Demo",missions,reviews,"owner",true);
  assert.equal(owner.intent,"decisions");
  assert.equal(owner.counts.pendingDecisions,1);
  assert.equal(owner.reviews.length,1);
  const member=buildChiefReply("Fais le point sur mes missions","Equipe Demo",missions,reviews,"member",false);
  assert.equal(member.counts.pendingDecisions,0);
  assert.equal(member.reviews.length,0);
  assert.equal(member.counts.total,2);
  assert.equal(member.chart.reduce((sum,entry)=>sum+entry.value,0),2);
  assert.ok(!member.text.includes("12 dépôts"));
});
