import test from "node:test";
import assert from "node:assert/strict";
import { normalizeTeamRequestManifest } from "../packages/engines/mausbot/src/team-request.mjs";
import { planTeamChannelMutation } from "../packages/engines/mausbot/src/team-channel-contracts.mjs";
export const teamFixture = () => ({ format: "openmaus.team", version: 2, team: { name: "Equipe", description: "Travail autorisé",
  members: [{ key: "vision", name: "VISION", title: "Analyse", description: "Revue", appearance: {color:"blue"} }] } });
test("team request normalizes a narrow manifest into the existing add-only import plan", () => {
 const raw=teamFixture(); raw.team.name=" Equipe "; raw.team.members[0].name=" VISION ";
 const result=normalizeTeamRequestManifest(raw);
 assert.equal(result.team.name,"Equipe"); assert.equal(result.team.members[0].name,"VISION");
 const plan=planTeamChannelMutation("teams.import",{manifest:result});
 assert.ok(plan.path.endsWith("?mode=add")); assert.equal(plan.callable,false);
});
test("team request refuses hidden privileges, tools, model, soul and appearance settings", () => {
 for(const field of ["approved","token","mode","prune","tools","modelSelection","full"]){
  const raw=teamFixture();raw.team[field]=true;assert.throws(()=>normalizeTeamRequestManifest(raw));
 }
 for(const field of ["soul","permissions","cwd","url","tools","model"]){
  const raw=teamFixture();raw.team.members[0][field]="forged";assert.throws(()=>normalizeTeamRequestManifest(raw));
 }
 const raw=teamFixture();raw.team.members[0].appearance.url="https://evil.example";assert.throws(()=>normalizeTeamRequestManifest(raw));
});
test("team request rejects empty, oversized, duplicate and malformed members", () => {
 for(const count of [0,13]){const raw=teamFixture();raw.team.members=Array.from({length:count},(_,i)=>({...raw.team.members[0],key:`a-${i}`}));assert.throws(()=>normalizeTeamRequestManifest(raw));}
 const duplicate=teamFixture();duplicate.team.members.push(structuredClone(duplicate.team.members[0]));assert.throws(()=>normalizeTeamRequestManifest(duplicate));
 for(const patch of [{key:"../bad"},{name:""},{title:"a\nb"},{description:"x".repeat(1001)},{appearance:{color:"unknown"}}]){
  const raw=teamFixture();Object.assign(raw.team.members[0],patch);assert.throws(()=>normalizeTeamRequestManifest(raw));
 }
});
