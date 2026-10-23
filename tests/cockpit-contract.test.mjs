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

test("new sections and transversal pages are honest empty states", () => {
  for (const page of [missions, inbox, related, chief, settings]) {
    assert.match(page, /<DemoNotice\/>/);
    assert.match(page, /<EmptyPanel/);
  }
  assert.match(workspaces, /listWorkspaces\(\)/);
  assert.match(workspaces, /workspace\.name/);
  assert.match(missions, /Aucune mission/);
  assert.match(inbox, /Votre Inbox est vide/);
  assert.match(related, /Aucun lien n’est déduit ou inventé/);
  assert.match(chief, /ne sont pas envoyées depuis cette interface/);
});

test("real GitHub connector is distinct from demo apps and agents show a truthful empty state", () => {
  assert.match(apps, /<GitHubWorkspacePicker/);
  assert.match(apps, /demoApps\.filter/);
  assert.match(apps, /Les autres connecteurs sont encore en préparation/);
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
