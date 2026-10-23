import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");
const [proxy, login, actions, contract, selector, shell, envExample, workspacePage, sessionControls, styles, workspaceActions, migration, triggerMigration, isolationTest, immutableOwnership, aclMigration, readme, migrationFiles] = await Promise.all([
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
  read("../supabase/migrations/20261023113800_minimize_workspace_table_privileges.sql"),
  read("../README.md"),
  readdir(new URL("../supabase/migrations/", import.meta.url)),
]);
const duo = await read("../src/app/login/duo-auth.tsx");
const policy = await read("../src/lib/auth/password-policy.ts");

test("the six cockpit sections are protected by verified Supabase claims", () => {
  for (const href of ["/", "/workspaces", "/missions", "/agents", "/apps", "/inbox"]) assert.ok(shell.includes(`href: "${href}"`));
  assert.match(proxy, /supabase\.auth\.getClaims\(\)/);
  assert.match(proxy, /!isAuthenticated/);
  assert.match(proxy, /url\.pathname = "\/login"/);
});

test("login and logout use server auth actions and expose safe user messages", () => {
  const surface = `${login}\n${duo}`;
  assert.match(surface, /role="alert"/);
  assert.match(surface, /Adresse ou mot de passe incorrect\./);
  assert.match(surface, /Connexion indisponible/);
  assert.match(surface, /Aucun accès n’est accordé en mode démonstration\./);
  assert.match(surface, /name="next"/);
  assert.match(surface, /aria-disabled=\{true\}/);
  assert.match(surface, /disabled/);
  assert.match(actions, /signInWithPassword/);
  assert.match(actions, /supabase\.auth\.signUp/);
  assert.match(actions, /full_name/);
  assert.match(actions, /export async function requestPasswordReset/);
  assert.doesNotMatch(actions, /resetPasswordForEmail/);
  assert.doesNotMatch(duo, /requestPasswordReset|La demande de réinitialisation a été acceptée/);
  assert.match(duo, /Le choix d’un nouveau mot de passe n’est pas disponible sur cet écran\./);
  assert.match(duo, /action=\{signIn\}/);
  assert.match(duo, /action=\{signUp\}/);
  assert.match(actions, /auth\.signOut\(\)/);
  assert.match(actions, /requestedPath\.startsWith\("\/\/"\)/);
  assert.match(actions, /createSupabaseServerClient/);
  assert.match(policy, /Au moins 8 caractères/);
  assert.doesNotMatch(surface, /accounts\.google|login\.microsoftonline|appleid\.apple/);
  assert.doesNotMatch(login, /NEXT_PUBLIC_|service_role|sb_secret|publishable/i);
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
  assert.match(isolationTest, /has_column_privilege\('authenticated', 'public\.workspaces', 'name', 'UPDATE'\)/);
  assert.match(isolationTest, /has_column_privilege\('authenticated', 'public\.workspaces', 'updated_at', 'UPDATE'\)/);
  assert.match(isolationTest, /has_column_privilege\('authenticated', 'public\.workspaces', 'created_by', 'UPDATE'\)/);
  assert.match(isolationTest, /has_table_privilege\('authenticated', 'public\.workspaces', 'UPDATE'\)/);
  assert.match(isolationTest, /has_table_privilege\('anon', 'public\.workspaces', privilege\)/);
  assert.match(isolationTest, /has_table_privilege\('anon', 'public\.workspace_members', privilege\)/);
  assert.match(isolationTest, /has_table_privilege\('authenticated', 'public\.workspace_members', 'UPDATE'\)/);
  assert.match(isolationTest, /has_any_column_privilege\('anon'/);
  assert.match(isolationTest, /workspace_members privileges are incomplete/);
  assert.match(isolationTest, /unnecessary % on workspace_members/);
  assert.match(isolationTest, /name = 'User A renamed workspace', updated_at = now\(\) \+ interval '1 minute'/);
  assert.match(isolationTest, /role = 'admin'/);
  assert.match(isolationTest, /User A workspace isolation failed/);
  assert.match(isolationTest, /User B workspace isolation failed/);
  assert.match(isolationTest, /Forged created_by was accepted/);
  assert.match(isolationTest, /Cross-tenant membership write was accepted/);
  assert.match(isolationTest, /Admin granted the owner role/);
  assert.match(isolationTest, /Workspace admin wrote to a different tenant/);
  assert.match(readme, /admin nominating another admin in that same workspace/i);
  assert.match(readme, /cannot write membership to another workspace, and neither admins nor owners can grant `owner`/i);
});

test("RLS auto-enable fails closed and its SQL regression test checks the trigger", () => {
  assert.match(triggerMigration, /create or replace function public\.rls_auto_enable/);
  assert.match(triggerMigration, /execute pg_catalog\.format\('alter table if exists/);
  assert.doesNotMatch(triggerMigration, /when others|failed to enable rls/i);
  assert.match(triggerMigration, /raise exception 'Expected ensure_rls event trigger is missing or misconfigured'/);
  assert.match(isolationTest, /RLS auto-enable still swallows failures/);
  assert.match(isolationTest, /RLS auto-enable did not protect a new public table/);
  assert.match(isolationTest, /forced rls_auto_enable failure/);
  assert.match(isolationTest, /RLS auto-enable swallowed a failure/);
  const ordered = migrationFiles.filter((file) => file.endsWith(".sql")).sort();
  const workspaceMigration = ordered.findIndex((file) => file.includes("auth_workspaces_rls"));
  const failClosedMigration = ordered.findIndex((file) => file.includes("fail_closed_rls_auto_enable"));
  const columnGrantMigration = ordered.findIndex((file) => file.includes("limit_workspace_update_columns"));
  const minimalAclMigration = ordered.findIndex((file) => file.includes("minimize_workspace_table_privileges"));
  assert.ok(workspaceMigration >= 0 && workspaceMigration < failClosedMigration && failClosedMigration < columnGrantMigration && columnGrantMigration < minimalAclMigration);
  assert.match(migration, /create table if not exists public\.workspaces/);
  assert.match(migration, /create schema if not exists private/);
  assert.match(migration, /create table if not exists public\.workspace_members/);
  assert.match(migration, /create or replace function private\.is_workspace_member/);
  assert.match(migration, /drop trigger if exists workspaces_add_owner_membership/);
  assert.match(migration, /drop policy if exists/g);
  assert.match(triggerMigration, /create or replace function public\.rls_auto_enable/);
  assert.match(immutableOwnership, /revoke update on public\.workspaces from authenticated/);
  assert.match(immutableOwnership, /grant update \(name, updated_at\) on public\.workspaces to authenticated/);
  assert.match(aclMigration, /revoke all privileges on table public\.workspaces, public\.workspace_members/);
  assert.match(aclMigration, /from public, anon, authenticated/);
  assert.match(aclMigration, /grant select, insert, delete on table public\.workspaces to authenticated/);
  assert.match(aclMigration, /grant update \(name, updated_at\) on table public\.workspaces to authenticated/);
  assert.match(aclMigration, /grant select, insert, delete on table public\.workspace_members to authenticated/);
});

test("only public Supabase settings are documented for the browser", () => {
  assert.match(envExample, /NEXT_PUBLIC_SUPABASE_URL=/);
  assert.match(envExample, /NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=/);
  const configuredKeys = envExample.split("\n").filter((line) => /^[A-Z][A-Z0-9_]*=/.test(line)).map((line) => line.split("=", 1)[0]);
  assert.deepEqual(configuredKeys, ["NEXT_PUBLIC_APP_NAME", "NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"]);
  assert.doesNotMatch(proxy + login + actions + contract + selector + shell, /SUPABASE_SERVICE_ROLE|service_role|sb_secret/i);
});
