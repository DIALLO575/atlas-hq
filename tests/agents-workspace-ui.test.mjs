import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = readFileSync(new URL("../src/app/agents/page.tsx", import.meta.url), "utf8");
const ui = readFileSync(new URL("../src/components/agents-workspace.tsx", import.meta.url), "utf8");
const api = readFileSync(new URL("../src/app/api/engines/mausbot/route.ts", import.meta.url), "utf8");
const css = readFileSync(new URL("../src/app/agents/agent-request.css", import.meta.url), "utf8");

test("Agents route presents real MAUSBOT teams as cards and drills into members", () => {
  assert.match(page, /<AgentsWorkspace \/>/);
  for (const className of ["atlas-team-grid","atlas-team-card","atlas-team-detail","atlas-team-member-grid",
    "atlas-team-member-card","atlas-people-chat","atlas-people-messages","atlas-people-thread-picker"]) {
    assert.ok(ui.includes(className), "missing " + className);
  }
  assert.match(ui, /team\.memberIds\.map/);
  assert.match(ui, /Ouvrir l’équipe/);
  assert.match(ui, /setOpenTeamId/);
  assert.match(ui, /chiefFor/);
  assert.match(ui, /Non renseigné/);
  assert.match(css, /@media\(max-width:700px\)/);
  assert.match(css, /@media\(max-width:420px\)/);
  assert.match(css, /grid-template-columns:1fr/);
});
test("MAUSBOT inventory projects chiefs and members only from real upstream fields", () => {
  assert.match(api, /chiefOfStaff: agent\.chiefOfStaff === true/);
  assert.match(api, /section: label\(group\.section, 100\)/);
  assert.match(api, /memberIds/);
  assert.match(ui, /agent\.chiefOfStaff === true/);
  assert.match(ui, /team\.section/);
  assert.match(ui, /Identité non retournée par MAUSBOT/);
  assert.doesNotMatch(ui, /SEO Growth Team|Engineering Team|Reddit Lead Miner|Competitor Watch/);
});
test("Team drill-down retains workspace and private conversation checks, never invents activity", () => {
  assert.match(ui, /view=inventory/);
  assert.match(ui, /data\.source !== "live-read-only"/);
  assert.match(ui, /MAUSBOT_INVENTORY_INVALID/);
  const updates = readFileSync(new URL("../src/app/api/engines/mausbot/updates/route.ts", import.meta.url), "utf8");
  assert.match(updates, /channels\.messages\.list/);
  assert.match(updates, /conversations\.messages\.list/);
  assert.match(ui, /cache: "no-store"/);
  assert.match(ui, /credentials: "same-origin"/);
  assert.match(ui, /canReadMessages/);
  assert.match(ui, /canWrite/);
  assert.match(ui, /Idempotency-Key/);
  assert.match(ui, /disabled=\{!canSend \|\| sending\}/);
  assert.doesNotMatch(ui, /\/api\/engines\/mausbot\/dispatch/);
});
test("Unrelated library, proposal workflow and n8n panel are not on the Agents screen", () => {
  for (const blocked of ["AgentRequestForm","N8nCoordinationPanel","Modèles d’équipes",
    "Création sous approbation","atlas-people-template-grid","atlas-people-bottom","proposalKind"]) {
    assert.ok(!ui.includes(blocked), blocked + " unexpectedly shown");
  }
  assert.doesNotMatch(ui, /href="\/engines\/approvals"/);
});

test("Real agent and Chief avatars render through the authenticated workspace-only proxy", () => {
  const bridge = readFileSync(new URL("../src/app/api/engines/mausbot/avatar/route.ts", import.meta.url), "utf8");
  const library = readFileSync(new URL("../packages/engines/mausbot/src/avatar.mjs", import.meta.url), "utf8");
  const primitives = readFileSync(new URL("../packages/engines/mausbot/src/primitives.mjs", import.meta.url), "utf8");
  assert.match(primitives, /storedMausbotAvatarPath\(bot\.avatarUrl\)/);
  assert.match(api, /hasAvatar: mausbotAvatarAvailable\(agent\)/);
  assert.match(bridge, /requireEngineWorkspace\(workspaceId\)/);
  assert.match(bridge, /executeMausbotPrimitive\(config, "agents.list"\)/);
  assert.match(bridge, /fetchMausbotAvatar\(config, path\)/);
  assert.match(bridge, /Cache-Control": "private, max-age=300, must-revalidate"/);
  assert.match(bridge, /"Vary": "Cookie"/);
  assert.match(bridge, /nosniff/);
  assert.match(library, /redirect: "manual"/);
  assert.match(ui, /AgentPortrait agent=\{teamChief\?\.agent\}/);
  assert.match(ui, /AgentPortrait agent=\{agent\}/);
  assert.match(ui, /AgentPortrait agent=\{selectedAgent/);
  assert.match(ui, /onError=\{\(\) => setFailed\(true\)\}/);
  assert.doesNotMatch(ui, /mausbot\.shadoron\.com/);
});

test("Messages use workspace-scoped memory cache and deltas, not persistent browser storage",()=>{
  const updates=readFileSync(new URL("../src/app/api/engines/mausbot/updates/route.ts",import.meta.url),"utf8");
  assert.match(updates,/requireEngineWorkspace\(workspaceId,true\)/);
  assert.match(updates,/executeMausbotPrimitive/);
  assert.match(updates,/mausbotMessageDelta/);
  assert.match(ui,/threadCache = useRef\(new Map/);
  assert.match(ui,/rememberMausbotThread\(threadCache.current,key,next\)/);
  assert.match(ui,/lastMausbotMessageId/);
  assert.match(ui,/mergeMausbotMessages/);
  assert.match(ui,/document.visibilityState === "hidden"/);
  assert.match(ui,/navigator.onLine === false/);
  assert.match(ui,/activeMessageKey.current !== key/);
  assert.doesNotMatch(ui,/localStorage|sessionStorage|indexedDB/);
  assert.doesNotMatch(updates,/revalidate|unstable_cache|cache: "force-cache"/);
});
test("Conversation can take full viewport while only message list scrolls on mobile",()=>{
  assert.match(ui,/fullscreenChat/);
  assert.match(ui,/aria-pressed=\{fullscreenChat\}/);
  assert.match(ui,/minimize/);
  assert.match(ui,/maximize/);
  assert.match(ui,/document.body.style.overflow = "hidden"/);
  assert.match(css,/is-chat-fullscreen/);
  assert.match(css,/height:100dvh/);
  assert.match(css,/overscroll-behavior:contain/);
  assert.match(css,/env\(safe-area-inset-bottom\)/);
});
