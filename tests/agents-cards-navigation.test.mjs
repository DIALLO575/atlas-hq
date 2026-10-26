import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const ui=readFileSync(new URL("../src/components/agents-workspace.tsx",import.meta.url),"utf8");
const css=readFileSync(new URL("../src/app/agents/agent-request.css",import.meta.url),"utf8");
const vercel=JSON.parse(readFileSync(new URL("../vercel.json",import.meta.url),"utf8"));
test("cards include agents outside teams",()=>{
 assert.match(ui,/atlas-agent-directory/);
 assert.match(ui,/inventory\.agents\.filter\(agent/);
 assert.match(ui,/Indépendant/);
 assert.match(ui,/atlas-team-avatar-stack/);
 assert.match(ui,/atlas-agent-card-v2/);
 assert.match(ui,/showAllAgents/);
});
test("team and agent cards open real MAUSBOT threads",()=>{
 assert.match(ui,/setOpenTeamId\(team\.id\)/);
 assert.match(ui,/threadsFor\(team\)/);
 assert.match(ui,/setOpenAgentId\(agent\.id\)/);
 assert.match(ui,/threadsFor\(agent\)/);
 assert.match(ui,/inventory && detailOpen/);
 assert.match(ui,/openedTeam && <section className="atlas-team-members"/);
 assert.match(ui,/\/api\/engines\/mausbot\/updates\?/);
 assert.match(ui,/\/api\/engines\/mausbot\/primitives/);
});
test("refresh preserves selection, workspace switch clears sensitive state",()=>{
 const load=ui.slice(ui.indexOf("setInventoryBusy(true)"),ui.indexOf("const openedTeam"));
 assert.doesNotMatch(load,/setSelection\(null\)/);
 assert.match(ui,/setOpenAgentId\(null\); setSelection\(null\); setThreadId\(""/);
 assert.match(ui,/threadCache\.current\.clear\(\)/);
});
test("responsive cards and preview opt-out",()=>{
 assert.match(css,/\.atlas-agent-grid\{display:grid/);
 assert.match(css,/@media\(max-width:390px\)/);
 assert.equal(vercel.git.deploymentEnabled["feat/agents-visual-cards-chat-20261026"],false);
});
