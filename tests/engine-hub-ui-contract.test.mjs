import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const hub = readFileSync(new URL("../src/components/engines-hub.tsx", import.meta.url), "utf8");
const page = readFileSync(new URL("../src/app/engines/page.tsx", import.meta.url), "utf8");
const style = readFileSync(new URL("../src/app/engine-hub.css", import.meta.url), "utf8");
const hermes = readFileSync(new URL("../public/brands/hermes-agent.svg", import.meta.url), "utf8");
const maus = readFileSync(new URL("../public/brands/mausbot.svg", import.meta.url), "utf8");

test("Engine Hub keeps real motor logos, status and links in a compact responsive catalogue", () => {
  for (const logo of ["/brands/mausbot.svg", "/brands/n8n.svg", "/brands/hermes-agent.svg"]) assert.ok(hub.includes(logo));
  assert.match(hermes, /<svg\b/);
  assert.match(maus, /<svg\b/);
  assert.match(hub, /atlas-engine-grid/);
  assert.match(hub, /atlas-engine-status/);
  assert.match(hub, /href="\/agents"/);
  assert.match(hub, /href="\/apps\/n8n"/);
  assert.match(hub, /view=health/);
  assert.match(page, /atlas-engine-page-head/);
  assert.match(style, /@media\(max-width:620px\)/);
  assert.match(style, /@media\(max-width:360px\)/);
  assert.match(style, /safe-area-inset-bottom/);
  assert.match(style, /min-height:44px/);
});
test("Moteurs page shows only catalogue, not diagnostic primitives, agents or mission forms", () => {
  assert.match(hub, /\/api\/engines\?workspaceId=/);
  assert.match(hub, /credentials: "same-origin"/);
  assert.match(hub, /cache: "no-store"/);
  assert.doesNotMatch(hub + page, /Primitives MAUSBOT|inventaire préconnexion|Nouvelle mission|Agents MAUSBOT/);
  assert.doesNotMatch(hub, /nativeCoverage|primitiveCoverage|validatedMutationPlans|view=agents|mausbot\/dispatch/);
  assert.doesNotMatch(hub, /submitMission|inspectJob|atlas-engine-workarea|atlas-engine-capability-panel/);
  assert.doesNotMatch(hub, /\bHTTP 423\b/);
});
test("Health is verified without pretending the configured engine is online", () => {
  assert.match(hub, /identity\?\.app === "openmausbot"/);
  assert.match(hub, /setOnline\(false\)/);
  assert.match(hub, /ENGINE_CATALOG_UNAVAILABLE/);
  assert.doesNotMatch(hub, /\{ id: "mausbot", name: "MAUSBOT", description:/);
});
