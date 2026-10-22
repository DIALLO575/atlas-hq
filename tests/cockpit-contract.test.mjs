import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");
const [shell, apps, agents, search, loading, errors, demoData] = await Promise.all([
  read("../src/components/app-shell.tsx"),
  read("../src/app/apps/page.tsx"),
  read("../src/app/agents/page.tsx"),
  read("../src/app/search/page.tsx"),
  read("../src/components/route-states.tsx"),
  Promise.all(["apps", "agents", "search"].map((route) => read(`../src/app/${route}/error.tsx`))),
  read("../src/lib/demo-data.ts"),
]);

test("cockpit navigation exposes accessible overview, apps, agents and search routes", () => {
  for (const route of ["/", "/apps", "/agents", "/search"]) assert.ok(shell.includes(`href: "${route}"`));
  assert.match(shell, /aria-current=\{active \? "page"/);
  assert.match(shell, /aria-expanded=\{menuOpen\}/);
  assert.match(shell, /Aller au contenu principal/);
});

test("mock catalogue is labelled and agents show a truthful empty state", () => {
  assert.match(apps, /<DemoNotice\/>/);
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
