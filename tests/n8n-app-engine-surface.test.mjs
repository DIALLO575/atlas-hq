import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { ENGINE_CATALOG } from "../packages/engine-core/src/catalog.mjs";
import { planEngineRegistration, EnginePersistenceInputError } from "../packages/engine-core/src/persistence-contracts.mjs";
import { N8N_CAPABILITIES } from "../packages/engines/n8n/src/contracts.mjs";

const read = path => readFile(new URL(path, import.meta.url), "utf8");
const W = "123e4567-e89b-42d3-a456-426614174000";
const U = "123e4567-e89b-42d3-a456-426614174001";

test("n8n engine reuses Atlas catalog and registers ONLY offline via SQL-compatible transport", () => {
  const engine = ENGINE_CATALOG.find(entry => entry.id === "n8n");
  assert.ok(engine);
  assert.equal(engine.phase, "adapter-v0");
  assert.deepEqual(engine.transports, ["http", "mcp"]);
  assert.deepEqual(engine.capabilities, N8N_CAPABILITIES.map(entry => entry.id));
  assert.equal(ENGINE_CATALOG.filter(entry => entry.id === "n8n").length, 1);
  for (const transport of engine.transports) {
    const plan = planEngineRegistration({ workspaceId: W, createdBy: U, engineKey: "n8n", label: "sandbox", transport });
    assert.equal(plan.connectionState, "offline");
    assert.equal(plan.callable, false);
    assert.equal(plan.requiresOwnerOrAdmin, true);
    assert.equal("apiKey" in plan, false);
  }
  for (const input of [{transport: "webhook"}, {transport: "https"}, {transport:"http",token:"secret"}, {transport:"http",connectionState:"connected"}]) {
    assert.throws(() => planEngineRegistration({workspaceId:W,createdBy:U,engineKey:"n8n",label:"sandbox",...input}), EnginePersistenceInputError);
  }
});

test("Mes Apps includes a true n8n page and local image, without claiming connected", async () => {
  const [catalog, directory, page, svg] = await Promise.all([
    read("../src/lib/app-catalog.ts"), read("../src/components/apps-directory.tsx"),
    read("../src/app/apps/n8n/page.tsx"), read("../public/brands/n8n.svg"),
  ]);
  assert.match(catalog, /slug: "n8n"/);
  assert.match(directory, /href="\/apps\/n8n"/);
  assert.match(directory, /app.slug === "n8n" \? "Préconnexion"/);
  assert.match(page, /createSupabaseServerClient/);
  assert.match(page, /supabase\.auth\.getUser\(\)/);
  assert.match(page, /from\("workspace_members"\)/);
  assert.match(page, /\.eq\("user_id", user\.id\)/);
  assert.match(page, /workspaces\.some\(w => w\.id === params\.workspaceId\)/);
  assert.match(page, /<N8nControlCenter/);
  assert.doesNotMatch(page, /ATLAS_N8N_API_KEY|process\.env|fetch\(["']https/);
  assert.match(svg, /<svg\b/);
  assert.doesNotMatch(svg, /<script\b|<foreignObject\b|<image\b|\bon\w+=|(?:xlink:)?href\s*=\s*["'](?!#)/i);
});

test("n8n status endpoint requires Supabase membership before any registry lookup", async () => {
  const route = await read("../src/app/api/apps/n8n/status/route.ts");
  const authPosition = route.indexOf("requireEngineWorkspace(workspaceId)");
  const dbPosition = route.indexOf('from("atlas_engine_instances")');
  assert.ok(authPosition > 0 && dbPosition > authPosition);
  assert.match(route, /\.eq\("workspace_id", workspaceId\)\.eq\("engine_key", "n8n"\)/);
  assert.match(route, /\.select\(columns\)/);
  assert.match(route, /const columns = "id,label,transport,connection_state,created_at"/);
  assert.match(route, /\.limit\(20\)/);
  assert.match(route, /getAll\("workspaceId"\)\.length !== 1/);
  assert.match(route, /connected: false/);
  assert.match(route, /readOnlyApiEnabled: false/);
  assert.match(route, /capabilitiesTestedLive: 0/);
  assert.match(route, /PRECONNECTION_ONLY_EGRESS_NOT_CERTIFIED/);
  assert.doesNotMatch(route, /testN8nConnection|listN8nWorkflows|getN8nWorkflowMetadata|listN8nExecutions|fetch\(/);
  assert.doesNotMatch(route, /apiKey|token|ciphertext|secret|service_role|SUPABASE_SERVICE_ROLE/i);
  assert.doesNotMatch(route, /export async function POST/);
});

test("engine listing shows n8n as preconnection but never configured or online", async () => {
  const [route, hub] = await Promise.all([
    read("../src/app/api/engines/route.ts"),
    read("../src/components/engines-hub.tsx"),
  ]);
  assert.match(route, /requireEngineWorkspace\(workspaceId\)/);
  assert.match(route, /resolveN8nReadOnlyConfig\(process\.env, workspaceId \?\? ""\)/);
  assert.match(route, /engine\.id === "n8n" \? \(n8nConfigured \? "preconnection" : "not-configured"\)/);
  assert.doesNotMatch(route, /testN8nConnection|listN8nWorkflows|n8nRequest/);
  assert.match(hub, /engine\.id === "n8n"/);
  assert.match(hub, /href="\/apps\/n8n"/);
});

test("n8n UI uses offline owner/admin registration with verified Atlas BFF", async () => {
  const [ui, instanceRoute] = await Promise.all([
    read("../src/components/n8n-control-center.tsx"),
    read("../src/app/api/engines/instances/route.ts"),
  ]);
  assert.match(ui, /fetch\("\/api\/apps\/n8n\/status\?workspaceId="/);
  assert.match(ui, /workspace\?\.role === "owner" \|\| workspace\?\.role === "admin"/);
  assert.match(ui, /fetch\("\/api\/engines\/instances"/);
  assert.match(ui, /engineKey: "n8n", transport: "http"/);
  assert.match(ui, /instances\.length \|\| submitting/);
  assert.match(ui, /Enregistrer hors ligne/);
  assert.match(ui, /Aucun accès au moteur n’a été activé/);
  assert.match(instanceRoute, /requireEngineWorkspace\(body\.workspaceId, true\)/);
  assert.match(instanceRoute, /connection_state: "offline"/);
  assert.doesNotMatch(ui, /NEXT_PUBLIC_N8N|ATLAS_N8N_API_KEY|https:\/\/[A-Za-z0-9_-]+\.n8n/i);
});
