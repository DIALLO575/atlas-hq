import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");
const [panel, contract, agentsPage] = await Promise.all([
  read("../src/components/agent-layer-panel.tsx"),
  read("../src/lib/agent-bridge.ts"),
  read("../src/app/agents/page.tsx"),
]);

test("agent layer consumes the server Agent Bridge identities, source refs and mission contracts", () => {
  assert.match(contract, /AgentResourceContext/);
  assert.match(contract, /AgentBridgeBootstrap/);
  assert.match(contract, /AgentIdentity, AgentMissionState, MissionReceipt, MissionSnapshot, ResourceRef/);
  assert.match(contract, /idempotencyKey: string/);
  assert.match(contract, /origin: "server" \| "team_roster"/);
});

test("agent layer does not launch without server-authorized context and capabilities", () => {
  assert.match(panel, /selectedAgent\.origin === "server"/);
  assert.match(panel, /selectedAgent\.activation === "enabled"/);
  assert.match(panel, /resource\.resource/);
  assert.match(panel, /disabled=\{!canLaunch\}/);
  assert.match(panel, /response\.ok/);
  assert.match(agentsPage, /Le contrat Agent Bridge n’est pas encore raccordé/);
});

test("mission and report states are sourced from Agent Bridge responses", () => {
  assert.match(panel, /fetch\("\/api\/agent-bridge\/missions"/);
  assert.match(panel, /api\/agent-bridge\/missions\/\$\{encodeURIComponent\(mission\.missionId\)\}/);
  assert.match(panel, /Mission \{missionStateLabels\[mission\.state\]\}/);
  assert.match(panel, /Rapport fourni par OpenMausBot/);
  assert.match(panel, /Aucun rapport n’est simulé/);
  assert.match(panel, /aria-live="polite"/);
});

test("resource context can be embedded while unsupported selection stays unavailable", () => {
  assert.match(panel, /resource\?: AgentResourceContext/);
  assert.match(panel, /Aucune ressource ouverte/);
  assert.match(panel, /Aucun accès vérifié/);
  assert.match(panel, /rel="noreferrer"/);
});
