import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");
const logos = [
  "notion", "github", "linear", "slack", "google-drive", "google-calendar",
  "google-sheets", "airtable", "salesforce", "google-analytics",
  "microsoft-365", "figma", "miro", "microsoft-teams",
  "calendly", "hubspot", "zapier", "clickup",
];

test("provider brand assets remain local and safe", async () => {
  for (const slug of logos) {
    const svg = await read("../public/brands/" + slug + ".svg");
    assert.match(svg, /<svg\b/);
    assert.match(svg, /<\/svg>/);
    assert.doesNotMatch(svg, /<script\b|<foreignObject\b|<image\b|\bon\w+=|(?:xlink:)?href\s*=\s*["'](?!#)/i);
  }
});

test("Mes Apps renders connected applications only, without mock catalogue or favorites", async () => {
  const [page, directory, source, layout] = await Promise.all([
    read("../src/app/apps/page.tsx"),
    read("../src/components/apps-directory.tsx"),
    read("../src/lib/connected-apps.ts"),
    read("../src/app/layout.tsx"),
  ]);
  assert.match(page, /listConnectedApps\(\)/);
  assert.match(page, /force-dynamic/);
  assert.match(page, /<AppsDirectory apps=\{apps\}/);
  assert.match(directory, /apps\.map\(\(app\)/);
  assert.match(directory, /app\.href/);
  assert.match(directory, /Aucune application connectée/);
  assert.match(directory, /Connexions indisponibles/);
  assert.doesNotMatch(directory, /atlasApps|recommendedApps|localStorage|Favoris|Connexion à venir|À découvrir|Recommandées/);
  assert.doesNotMatch(page, /githubConfigured|apps-catalog|Explorer les apps/);
  assert.doesNotMatch(layout, /import "\.\/apps-redesign\.css"/);
  assert.deepEqual(
    [...source.matchAll(/\{ slug: "(.*?)", name:/g)].map((match) => match[1]),
    ["github", "notion", "linear"],
  );
  assert.doesNotMatch(source, /\bslug: "n8n"|\bslug: "figma"|\bslug: "slack"/);
});

test("provider status checks are scoped to authenticated workspace membership and stored verification", async () => {
  const source = await read("../src/lib/connected-apps.ts");
  assert.match(source, /client\.auth\.getUser\(\)/);
  assert.match(source, /from\("workspace_members"\)/);
  assert.match(source, /\.eq\("user_id", user\.id\)/);
  assert.match(source, /status", "repositories-ready"/);
  assert.match(source, /ownership_verified_at && item\.repositories_verified_at/);
  assert.match(source, /atlas_connections/);
  assert.match(source, /atlas_notion_connections/);
  assert.match(source, /verified\.has\(row\.workspace_id \+ ":" \+ row\.id\)/);
  assert.match(source, /atlas_linear_connections/);
  assert.match(source, /\.is\("revoked_at", null\)/);
  assert.match(source, /Promise\.allSettled/);
  assert.doesNotMatch(source, /\.select\("\*"\)|access_token|refresh_token|ciphertext/i);
});

test("Mes Apps stays compact and responsive on mobile and desktop", async () => {
  const [page, css] = await Promise.all([
    read("../src/app/apps/page.tsx"),
    read("../src/app/apps/connected-apps.css"),
  ]);
  assert.match(page, /import "\.\/connected-apps\.css"/);
  assert.match(css, /grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(css, /@media \(max-width: 900px\)/);
  assert.match(css, /@media \(max-width: 600px\)/);
  assert.match(css, /grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(css, /focus-visible/);
});

test("Linear connection status endpoint remains actor-scoped without credential reads", async () => {
  const route = await read("../src/app/api/apps/linear/connection/route.ts");
  assert.match(route, /requireLinearWorkspaceMember\(workspaceId\)/);
  assert.match(route, /\.eq\("workspace_id", actor\.workspaceId\)\.eq\("user_id", actor\.userId\)/);
  assert.match(route, /\.select\("revoked_at"\)/);
  assert.match(route, /!connection\.revoked_at/);
  assert.doesNotMatch(route, /access_token|refresh_token|ciphertext/i);
});
