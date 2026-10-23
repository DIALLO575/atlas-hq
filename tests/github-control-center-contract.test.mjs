import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("GitHub Control Center uses the authenticated scoped service, not fake project counts", async () => {
  const [page, ui, api] = await Promise.all([
    read("../src/app/apps/github/page.tsx"),
    read("../src/components/github-control-center.tsx"),
    read("../src/app/api/apps/github/route.ts"),
  ]);
  assert.match(page, /supabase\.auth\.getUser\(\)/);
  assert.match(page, /from\("workspace_members"\)/);
  assert.match(page, /\.eq\("user_id", user\.id\)/);
  assert.match(page, /workspaces\.some\(\(workspace\) => workspace\.id === params\.workspaceId\)/);
  assert.match(ui, /readGitHub<\{ installations: Installation\[\] \}>\(/);
  assert.match(ui, /view: "connections"/);
  assert.match(ui, /view: "repositories"/);
  assert.match(ui, /view: "pulls"/);
  assert.match(ui, /view: "pull"/);
  assert.match(ui, /fetch\("\/api\/apps\/github\?"/);
  assert.match(api, /if \(!membership \|\|/);
  assert.match(api, /createAuthorizedGitHubReader/);
  assert.doesNotMatch(ui, /12 dépôts|8 PR ouvertes|3 actions|PR #42|atlas-mobile|fake|demoWorkspaces/i);
});

test("control center is read-only with truthful agent, automation and PR status", async () => {
  const [ui, api, docs] = await Promise.all([
    read("../src/components/github-control-center.tsx"),
    read("../src/app/api/apps/github/route.ts"),
    read("../docs/integrations/github-app-live-read.md"),
  ]);
  assert.match(ui, /Aucune action sur le code, merge ou validation automatique/);
  assert.match(ui, /Aucun merge, validation, déclencheur ou agent IA n’est exécuté/);
  assert.doesNotMatch(ui, /tab === "agents"|tab === "automations"|Fonctionnalité à venir/);
  assert.match(ui, /section === "settings"/);
  assert.match(ui, /action="\/api\/apps\/github\/connect\/start"/);
  assert.match(ui, /role="alert"/);
  assert.match(ui, /filesTruncated/);
  assert.match(ui, /pullsTruncated/);
  assert.match(ui, /rel="noopener noreferrer"/);
  assert.doesNotMatch(api, /export async function (POST|PUT|PATCH|DELETE)/);
  assert.match(docs, /read-only/i);
});

test("Mes Apps links to Control Center and responsive styles are available", async () => {
  const [dir, layout, page, css] = await Promise.all([
    read("../src/components/apps-directory.tsx"),
    read("../src/app/layout.tsx"),
    read("../src/app/apps/github/page.tsx"),
    read("../src/app/github-control-center.css"),
  ]);
  assert.match(dir, /href="\/apps\/github"/);
  assert.match(dir, /Ouvrir GitHub Control Center/);
  assert.match(page, /GitHubControlCenter/);
  assert.match(layout, /github-control-center\.css/);
  assert.match(css, /\.atlas-gh-content/);
  assert.match(css, /@media\(max-width:760px\)/);
  assert.match(css, /atlas-gh-stats/);
  assert.match(css, /atlas-gh-tabs/);
});


test("live status depends on a successful GitHub read, never only on a saved installation", async () => {
  const ui = await read("../src/components/github-control-center.tsx");
  assert.match(ui, /const hasLiveRepositories = lastSynced !== null/);
  assert.match(ui, /setLastSynced\(new Date\(\)\.toISOString\(\)\)/);
  assert.match(ui, /"Aucun accès GitHub live confirmé"/);
  assert.match(ui, /const status = problem \? "error" : hasLiveRepositories \? "live"/);
  assert.match(ui, /lastSynced \? "Données récupérées le "/);
  assert.match(ui, /Aucune installation enregistrée/);
});

test("switching workspace or repository cancels stale requests", async () => {
  const ui = await read("../src/components/github-control-center.tsx");
  assert.match(ui, /new AbortController\(\)/);
  assert.match(ui, /requestRef\.current\?\.abort\(\)/);
  assert.match(ui, /controller\.signal\.aborted/);
  assert.match(ui, /key=\{selected\.id\}/);
  assert.match(ui, /requestRef\.current\?\.abort\(\); \};/);
  assert.match(ui, /fetch\("\/api\/apps\/github\?"[\s\S]+signal,/);
});

test("read-only provider-backed PR file patches are expandable, escaped and bounded", async () => {
  const ui = await read("../src/components/github-control-center.tsx");
  assert.match(ui, /setExpandedFile/);
  assert.match(ui, /detail\.files\.slice\(0, visibleFileCount\)/);
  assert.match(ui, /file\.patch\.split\("\\n"\)\.map/);
  assert.match(ui, /line\.startsWith\("\+"\)/);
  assert.match(ui, /setVisibleFileCount\(\(count\) => count \+ 35\)/);
  assert.match(ui, /aria-expanded=\{expandedFile === file\.path\}/);
  assert.match(ui, /href=\{detail\.htmlUrl\}/);
});

test("real GitHub connection POST is only presented to authorized workspace admins", async () => {
  const ui = await read("../src/components/github-control-center.tsx");
  assert.match(ui, /const canInstall = workspace\.role === "owner" \|\| workspace\.role === "admin"/);
  assert.match(ui, /configured && canInstall \?/);
  assert.match(ui, /action="\/api\/apps\/github\/connect\/start"/);
  assert.match(ui, /name="workspaceId" value=\{workspace\.id\}/);
});
