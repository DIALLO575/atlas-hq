import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");
const [shell, apps, agents, search, loading, errors, demoData, workspaces, missions, inbox, related, chief, settings] = await Promise.all([
  read("../src/components/app-shell.tsx"),
  read("../src/app/apps/page.tsx"),
  read("../src/app/agents/page.tsx"),
  read("../src/app/search/page.tsx"),
  read("../src/components/route-states.tsx"),
  Promise.all(["apps", "agents", "search", "workspaces", "missions", "inbox", "related", "chief", "settings"].map((route) => read(`../src/app/${route}/error.tsx`))),
  read("../src/lib/demo-data.ts"),
  read("../src/app/workspaces/page.tsx"),
  read("../src/app/missions/page.tsx"),
  read("../src/app/inbox/page.tsx"),
  read("../src/app/related/page.tsx"),
  read("../src/app/chief/page.tsx"),
  read("../src/app/settings/page.tsx"),
]);
const workspacesDashboard = await read("../src/components/workspaces-dashboard.tsx");

test("cockpit navigation exposes six primary destinations and transversal access", () => {
  for (const route of ["/", "/workspaces", "/missions", "/agents", "/apps", "/inbox"]) assert.ok(shell.includes(`href: "${route}"`));
  for (const route of ["/search", "/related", "/chief", "/settings"]) assert.ok(shell.includes(`href: "${route}"`));
  for (const label of ["Accueil", "Workspaces", "Missions", "Agents & Équipes", "Mes Apps", "Inbox"]) assert.ok(shell.includes(`label: "${label}"`));
  assert.match(shell, /aria-current=\{pathname === item.href \? "page"/);
  assert.match(shell, /aria-expanded=\{menuOpen\}/);
  assert.match(shell, /Navigation rapide/);
  assert.match(shell, /mobileItems/);
  assert.match(shell, /Aller au contenu principal/);
});

test("missions and inbox are real workflow pages; transversal demos remain honest", () => {
  for (const page of [related, chief, settings]) {
    assert.match(page, /<DemoNotice\/>/);
    assert.match(page, /<EmptyPanel/);
  }
  assert.match(workspaces, /listWorkspaces\(\)/);
  assert.match(workspaces, /<WorkspacesDashboard/);
  assert.match(workspacesDashboard, /workspace\.name/);
  assert.match(missions, /readAtlasWorkflow\(params\.workspaceId\)/);
  assert.match(inbox, /readAtlasWorkflow\(params\.workspaceId\)/);
  assert.match(missions, /createAtlasMission/);
  assert.match(inbox, /decideAtlasMissionReview/);
  assert.doesNotMatch(missions + inbox, /<DemoNotice\/>|<EmptyPanel/);
  assert.match(related, /Aucun lien n’est déduit ou inventé/);
  assert.match(chief, /ne sont pas envoyées depuis cette interface/);
});

test("premium Mes Apps preserves its directory and offers the real GitHub connector", () => {
  assert.match(apps, /<AppsDirectory/);
  assert.match(apps, /<GitHubWorkspacePicker/);
  assert.match(agents, /Aucun agent connecté/);
  assert.match(agents, /Aucune conversation ni activité d’agent n’est simulée/);
  assert.match(demoData, /export const demoApps/);
  assert.match(demoData, /Google Calendar/);
});

test("search has accessible live results and a no-match state", () => {
  assert.match(search, /role="search"/);
  assert.match(search, /aria-live="polite"/);
  assert.match(search, /Aucun résultat/);
  assert.match(search, /toLocaleLowerCase\("fr"\)/);
});

test("loading and retryable error states exist on every secondary route", () => {
  assert.match(loading, /aria-busy="true"/);
  assert.match(loading, /role="status"/);
  for (const error of errors) assert.match(error, /ErrorState reset=\{reset\}/);
  assert.match(loading, /role="alert"/);
  assert.match(loading, /Réessayer/);
});
