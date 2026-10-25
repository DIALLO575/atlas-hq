import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = readFileSync(new URL("../src/app/agents/page.tsx", import.meta.url), "utf8");
const ui = readFileSync(new URL("../src/components/agents-workspace.tsx", import.meta.url), "utf8");
const requests = readFileSync(new URL("../src/components/agent-request-form.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../src/app/agents/agent-request.css", import.meta.url), "utf8");

test("Agents route is now a real workspace: teams, agents, thread picker and conversation pane", () => {
  assert.match(page, /<AgentsWorkspace \/>/);
  for (const part of ["atlas-people-console","atlas-people-sidebar","atlas-people-chat","atlas-people-inspector",
    "atlas-people-messages","atlas-people-thread-picker","atlas-people-roster","atlas-people-template-grid"]) {
    assert.ok(ui.includes(part), "missing " + part);
  }
  assert.match(ui, /atlas-people-search/);
  assert.match(css, /@media\(max-width:700px\)/);
  assert.match(css, /atlas-people-directory-item\.is-selected/);
});
test("Data is workspace scoped, owner writes are conditional, and content is never fabricated", () => {
  assert.match(ui, /view=inventory/);
  assert.match(ui, /data\.source !== "live-read-only"/);
  assert.match(ui, /MAUSBOT_INVENTORY_INVALID/);
  assert.match(ui, /channels\.messages\.list/);
  assert.match(ui, /conversations\.messages\.list/);
  assert.match(ui, /cache: "no-store"/);
  assert.match(ui, /credentials: "same-origin"/);
  assert.match(ui, /canReadMessages/);
  assert.match(ui, /canWrite/);
  assert.match(ui, /Idempotency-Key/);
  assert.match(ui, /disabled=\{!canSend \|\| sending\}/);
  assert.match(ui, /MAUSBOT_INVENTORY_INVALID/);
  assert.doesNotMatch(ui, /\/api\/engines\/mausbot\/dispatch/);
});
test("Team and agent creation remain approval-only and are not conflated with chat sending", () => {
  assert.match(ui, /AgentRequestForm/);
  assert.match(requests, /\/api\/engines\/"/);
  assert.match(requests, /canDispatch !== false/);
  assert.match(requests, /crypto\.randomUUID/);
  assert.match(requests, /openmaus\.team/);
  assert.doesNotMatch(requests, /mausbot\/dispatch/);
});
