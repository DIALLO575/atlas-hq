import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";

const load=(p)=>readFile(new URL(p,import.meta.url),"utf8");
test("GitHub Actions API checks Supabase membership, repository grant and provider",async()=>{
 const route=await load("../src/app/api/apps/github/actions/route.ts");
 assert.match(route,/auth\.getUser\(\)/);
 assert.match(route,/workspace_members/);
 assert.match(route,/atlas_github_installations/);
 assert.match(route,/atlas_github_authorized_repositories/);
 assert.match(route,/installation\.repository_selection==="selected"/);
 assert.match(route,/createGitHubActionsReader/);
 assert.match(route,/view==="runs"/);
 assert.match(route,/Cache-Control":"no-store"/);
 assert.doesNotMatch(route,/export async function POST|rerun|dispatches/);
});
test("GitHub Actions UI renders real workflow data and supervised job rerun with confirmation",async()=>{
 const ui=await load("../src/components/github-actions-control-center.tsx");
 const page=await load("../src/components/github-control-center.tsx");
 const css=await load("../src/app/github-control-center.css");
 assert.match(page,/id: "actions"/);
 assert.match(page,/<GitHubActionsControlCenter/);
 assert.match(page,/section === "actions"/);
 assert.match(ui,/fetch\("\/api\/apps\/github\/actions/);
 assert.match(ui,/failedSteps/);
 assert.match(ui,/Consulter les logs GitHub/);
 assert.match(ui,/Confirmer la relance/);
 assert.match(ui,/confirmRerun/);
 assert.match(css,/\.atlas-gh-actions-content\{display:grid/);
 assert.match(css,/@media\(max-width:600px\)/);
});

test("Actions diagnostics distinguish provider refusals without demanding App reapproval",async()=>{
 const [ui,client,route]=await Promise.all([
  load("../src/components/github-actions-control-center.tsx"),
  load("../packages/connectors/github/src/github-actions-client.mjs"),
  load("../src/app/api/apps/github/actions/route.ts"),
 ]);
 for(const code of ["INSTALLATION_SCOPE_REJECTED","ACTIONS_TOKEN_SCOPE_UNVERIFIED","ACTIONS_API_FORBIDDEN"]){
  assert.match(ui,new RegExp(code));
  assert.match(route,new RegExp(code));
 }
 assert.match(client,/context === "actions" \? "ACTIONS_API_FORBIDDEN"/);
 assert.doesNotMatch(ui,/doit recevoir « Actions: Read »/);
});
