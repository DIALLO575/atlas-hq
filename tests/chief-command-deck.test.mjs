import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("Chief Command Deck replaces the demo Chief with a workspace-scoped real briefing", async()=>{
  const [page,view,briefing] = await Promise.all([
    read("../src/app/chief/page.tsx"),
    read("../src/components/chief-command-deck.tsx"),
    read("../src/lib/chief/briefing.ts"),
  ]);
  assert.match(page, /readAtlasWorkflow\(params\.workspaceId\)/);
  assert.match(page, /buildChiefReply\(initialPrompt/);
  assert.match(page, /<ChiefCommandDeck key=\{data\.selected\.id\}/);
  assert.match(page, /data\.selected\.role === "owner"/);
  assert.match(view, /atlas-chief-workspace-switch/);
  assert.match(view, /atlas-chief-conversation/);
  assert.match(view, /atlas-chief-threads/);
  assert.match(view, /atlas-chief-context/);
  assert.match(view, /atlas-chief-metrics/);
  assert.match(view, /atlas-chief-chart-bars/);
  assert.match(view, /Nouvelle conversation/);
  assert.match(briefing, /missions\.filter/);
  assert.match(briefing, /reviews\.filter/);
  assert.doesNotMatch(page, /<DemoNotice|<EmptyPanel/);
  assert.doesNotMatch(view, /PR #482|8 missions|12 dépôts|Atlas Studio|28 actions cette semaine/);
});

test("Chief API runs on server with auth, RLS, strict input scope and no writes",async()=>{
  const [api,workflow] = await Promise.all([
    read("../src/app/api/chief/route.ts"),
    read("../src/lib/atlas-workflow.ts")
  ]);
  assert.match(api,/export async function POST/);
  assert.match(api,/origin !== request\.nextUrl\.origin/);
  assert.match(api,/UUID\.test\(workspaceId\)/);
  assert.match(api,/message\.length > 700/);
  assert.match(api,/readAtlasWorkflow\(workspaceId\)/);
  assert.match(api,/data\.selected\.role === "owner"/);
  assert.match(api,/buildChiefReply\(/);
  assert.match(api,/Cache-Control/);
  assert.doesNotMatch(api, /service_role|api\.openai|fetch\("https:|\.insert\(|\.update\(|\.delete\(/);
  assert.match(workflow,/supabase\.auth\.getUser\(\)/);
  assert.match(workflow,/from\("workspace_members"\)/);
  assert.match(workflow,/\.eq\("user_id", user\.id\)/);
  assert.match(workflow,/\.eq\("workspace_id", selected\.id\)/);
});

test("Guided Chief chat is explicitly not pretending to be a connected LLM",async()=>{
  const [view,brief,home] = await Promise.all([
    read("../src/components/chief-command-deck.tsx"),
    read("../src/lib/chief/briefing.ts"),
    read("../src/components/chief-composer.tsx")
  ]);
  assert.match(view,/method:"POST"/);
  assert.match(view,/fetch\("\/api\/chief"/);
  assert.match(view,/IA libre non connectée/);
  assert.match(view,/Échanges temporaires/);
  assert.match(view,/Aucun agent IA externe ni action automatique/);
  assert.match(view,/credentials:"same-origin"/);
  assert.match(brief,/conversation libre avec un modèle IA n’est pas encore connectée/);
  assert.match(brief,/répartition actuelle/i);
  assert.match(home,/router\.push\("\/chief/);
  assert.doesNotMatch(home,/disabled aria-label="Envoi indisponible/);
});

test("Chief GitHub context uses authorized API and does not invent PR totals",async()=>{
  const [view,api]=await Promise.all([
    read("../src/components/chief-command-deck.tsx"),
    read("../src/app/api/apps/github/route.ts"),
  ]);
  assert.match(view,/fetch\(endpoint\+query/);
  assert.match(view,/&view=connections/);
  assert.match(view,/&view=repositories/);
  assert.match(view,/&view=pulls/);
  assert.match(view,/installationId/);
  assert.match(view,/firstRepo/);
  assert.match(view,/github\.stage==="ready"/);
  assert.match(view,/PR · 1 dépôt/);
  assert.match(api,/createAuthorizedGitHubReader/);
  assert.match(api,/from\("workspace_members"\)/);
  assert.match(api,/from\("atlas_github_authorized_repositories"\)/);
});

test("illustration-inspired UI is responsive, uses real charts, has working controls",async()=>{
  const [view,css,layout] = await Promise.all([
    read("../src/components/chief-command-deck.tsx"),
    read("../src/app/chief-command-deck.css"),
    read("../src/app/layout.tsx"),
  ]);
  assert.match(view,/className="atlas-chief-deck"/);
  assert.match(view,/role="img"/);
  assert.match(view,/style=\{\{height:/);
  assert.match(view,/onSubmit=\{event/);
  assert.match(view,/onClick=\{startNew\}/);
  assert.match(view,/router\.push\("\/chief\?workspaceId="/);
  assert.match(view,/aria-label="Conversations de cette session"/);
  assert.match(css,/grid-template-columns:minmax\(172px,205px\)/);
  assert.match(css,/@media\(max-width:760px\)/);
  assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
  assert.match(layout,/chief-command-deck\.css/);
});


test("Chief GitHub context supports both selected and all repository grants", async () => {
  const ui = await read("../src/components/chief-command-deck.tsx");
  assert.match(ui, /\["selected","all"\]\.includes\(item\.repositorySelection\)/);
});
