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
  assert.match(ui, /githubRead<\{ installations: Installation\[\] \}>\(/);
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
  assert.match(ui, /L’analyse de PR par un agent n’est pas encore raccordée/);
  assert.match(ui, /Les déclencheurs après push/);
  assert.match(ui, /tab === "settings"/);
  assert.match(ui, /action="\/api\/apps\/github\/connect\/start"/);
  assert.match(ui, /role="alert"/);
  assert.match(ui, /filesTruncated/);
  assert.match(ui, /pullsTruncated/);
  assert.match(ui, /"noopener noreferrer"/);
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
