import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");
const [proxy, login, actions, contract, selector, shell, envExample, workspacePage, sessionControls, styles, workspaceActions, migration, triggerMigration, isolationTest, immutableOwnership] = await Promise.all([
  read("../src/lib/supabase/proxy.ts"),
  read("../src/app/login/page.tsx"),
  read("../src/app/login/actions.ts"),
  read("../src/lib/workspaces/contract.ts"),
  read("../src/components/workspace-selector.tsx"),
  read("../src/components/app-shell.tsx"),
  read("../.env.example"),
  read("../src/app/workspaces/page.tsx"),
  read("../src/components/session-controls.tsx"),
  read("../src/app/globals.css"),
  read("../src/app/workspaces/actions.ts"),
  read("../supabase/migrations/20261023071054_auth_workspaces_rls.sql"),
  read("../supabase/migrations/20261023072200_fail_closed_rls_auto_enable.sql"),
  read("../supabase/tests/workspace_rls.sql"),
  read("../supabase/migrations/20261023073700_limit_workspace_update_columns.sql"),
]);

test("the six cockpit sections are protected by verified Supabase claims", () => {
  for (const href of ["/", "/workspaces", "/missions", "/agents", "/apps", "/inbox"]) assert.ok(shell.includes(`href: "${href}"`));
  assert.match(proxy, /supabase\.auth\.getClaims\(\)/);
  assert.match(proxy, /!isAuthenticated/);
  assert.match(proxy, /url\.pathname = "\/login"/);
});

test("login and logout use server auth actions and expose safe user messages", () => {
  assert.match(login, /role=\{reason === "credentials" \|\| reason === "invalid-input" \? "alert" : "status"\}/);
  assert.match(actions, /signInWithPassword/);
  assert.match(actions, /auth\.signOut\(\)/);
  assert.match(actions, /requestedPath\.startsWith\("\/\/"\)/);
  assert.match(login, /name="next"/);
  assert.doesNotMatch(actions, /service_role|sb_secret/i);
});

test("session controls distinguish loading, connected, signed-out, and failed states", () => {
  assert.match(sessionControls, /status: "loading"/);
  assert.match(sessionControls, /status: "ready"; email: string/);
  assert.match(sessionControls, /status: "signed-out"/);
  assert.match(sessionControls, /status: "error"/);
  assert.match(sessionControls, /Déconnecté/);
  assert.match(sessionControls, /Session indisponible/);
  assert.match(sessionControls, /disabled=\{session\.status !== "ready"\}/);
  assert.match(styles, /@media\(max-width:680px\).*\.session-row/s);
  assert.match(sessionControls, /listener\.subscription\.unsubscribe\(\)/);
});

test("workspace requests resolve the authenticated user on the server and authorize membership", () => {
  assert.match(workspaceActions, /supabase\.auth\.getUser\(\)/);
  assert.match(workspaceActions, /\.eq\("user_id", user\.id\)/);
  assert.match(workspaceActions, /workspaces!inner\(id, name\)/);
  assert.match(workspaceActions, /workspaces\.find\(\(workspace\) => workspace\.id === workspaceId\)/);
  assert.match(workspaceActions, /created_by: resolved\.userId/);
  assert.doesNotMatch(workspaceActions, /owner_id|created_by:.*name/);
  assert.match(contract, /role: "owner" \| "admin" \| "member"/);
  assert.match(selector, /Chargement des workspaces/);
  assert.match(selector, /role="alert"/);
  assert.match(selector, /listWorkspaces\(\)/);
  assert.match(workspacePage, /Workspaces/);
});

test("workspace migration binds reads and writes to auth.uid with tenant RLS", () => {
  assert.match(migration, /enable row level security/g);
  assert.match(migration, /private\.is_workspace_member\(id\)/);
  assert.match(migration, /private\.is_workspace_admin\(workspace_id\)/);
  assert.match(migration, /created_by = \(select auth\.uid\(\)\)/);
  assert.match(migration, /role in \('owner', 'admin', 'member'\)/);
  assert.match(migration, /after insert on public\.workspaces/);
  assert.match(immutableOwnership, /revoke update on public\.workspaces from authenticated/);
  assert.match(immutableOwnership, /grant update \(name, updated_at\) on public\.workspaces to authenticated/);
  assert.match(isolationTest, /User A workspace isolation failed/);
  assert.match(isolationTest, /User B workspace isolation failed/);
  assert.match(isolationTest, /Forged created_by was accepted/);
  assert.match(isolationTest, /Cross-tenant membership write was accepted/);
});

test("RLS auto-enable fails closed and its SQL regression test checks the trigger", () => {
  assert.match(triggerMigration, /create or replace function public\.rls_auto_enable/);
  assert.match(triggerMigration, /execute pg_catalog\.format\('alter table if exists/);
  assert.doesNotMatch(triggerMigration, /when others|failed to enable rls/i);
  assert.match(triggerMigration, /raise exception 'Expected ensure_rls event trigger is missing or misconfigured'/);
  assert.match(isolationTest, /RLS auto-enable still swallows failures/);
  assert.match(isolationTest, /RLS auto-enable did not protect a new public table/);
});

test("only public Supabase settings are documented for the browser", () => {
  assert.match(envExample, /NEXT_PUBLIC_SUPABASE_URL=/);
  assert.match(envExample, /NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=/);
  const configuredKeys = envExample.split("\n").filter((line) => /^[A-Z][A-Z0-9_]*=/.test(line)).map((line) => line.split("=", 1)[0]);
  assert.deepEqual(configuredKeys, ["NEXT_PUBLIC_APP_NAME", "NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"]);
  assert.doesNotMatch(proxy + login + actions + contract + selector + shell, /SUPABASE_SERVICE_ROLE|service_role|sb_secret/i);
});
