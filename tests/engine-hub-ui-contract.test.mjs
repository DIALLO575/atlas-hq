import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const hub = readFileSync(new URL("../src/components/engines-hub.tsx", import.meta.url), "utf8");
const page = readFileSync(new URL("../src/app/engines/page.tsx", import.meta.url), "utf8");
const style = readFileSync(new URL("../src/app/engine-hub.css", import.meta.url), "utf8");
const hermes = readFileSync(new URL("../public/brands/hermes-agent.svg", import.meta.url), "utf8");
const maus = readFileSync(new URL("../public/brands/mausbot.svg", import.meta.url), "utf8");

test("Engine Hub presents official local motor logos and responsive Atlas UI", () => {
  for (const source of [hub, page]) {
    assert.match(source, /\/brands\/mausbot\.svg/);
    assert.match(source, /\/brands\/hermes-agent\.svg/);
  }
  assert.match(hermes, /<svg\b/);
  assert.match(maus, /<svg\b/);
  assert.match(style, /@media\(max-width:620px\)/);
  assert.match(page, /atlas-engine-page-head/);
  assert.match(hub, /atlas-engine-status/);
});
test("Visual update retains preconnection truth and release-safe API contract", () => {
  assert.match(hub, /view=health/);
  assert.match(hub, /view=agents/);
  assert.match(hub, /\/api\/engines\/mausbot\/dispatch/);
  assert.match(hub, /HTTP 423/);
  assert.match(hub, /Aucun agent fictif/);
  assert.match(page, /\/engines\/approvals/);
});
