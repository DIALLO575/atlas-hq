import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");
const [migration, proxy, auth, workspace, login, home, apps, agents, search] = await Promise.all([
  read("../supabase/migrations/20261023000127_auth_workspaces_rls.sql"),
  read("../proxy.ts"),
  read("../src/lib/auth.ts"),
  read("../src/lib/workspaces.ts"),
  read("../src/app/login/actions.ts"),
  read("../src/app/page.tsx"),
  read("../src/app/apps/page.tsx"),
  read("../src/app/agents/page.tsx"),
  read("../src/app/search/page.tsx"),
]);

test("workspaces and memberships have explicit roles, ownership and row policies", () => {
  assert.match(migration, /role in \('owner', 'admin', 'member'\)/);
  assert.match(migration, /create trigger workspaces_add_owner_membership/);
  assert.match(migration, /create policy workspaces_read_member/);
  assert.match(migration, /create policy workspace_members_add_admin/);
  assert.match(migration, /role in \('admin', 'member'\)/);
  assert.match(migration, /create policy workspace_members_remove_admin[\s\S]*?role = 'member'/);
  assert.match(migration, /security definer[\s\S]*?set search_path = ''/);
  assert.match(migration, /grant update \(name, updated_at\) on public\.workspaces to authenticated/);
  assert.doesNotMatch(migration, /grant select, insert, update, delete on public\.workspaces to authenticated/);
  assert.match(migration, /create schema private/);
  assert.match(migration, /revoke all on schema private from public/);
  for (const relation of ["atlas_connections", "atlas_provider_objects", "atlas_sync_cursors"]) {
    assert.match(migration, new RegExp(`grant select, insert, update, delete on public\\.${relation} to authenticated`));
    for (const operation of ["insert", "update", "delete"]) {
      assert.match(migration, new RegExp(`create policy ${relation}_[^\\n]*${operation}[^\\n]*\\n`));
    }
  }
});

test("all application routes verify the Supabase user and proxy refreshes sessions", () => {
  assert.match(auth, /supabase\.auth\.getUser\(\)/);
  assert.match(auth, /if \(error \|\| !user\) redirect\("\/login"\)/);
  assert.match(proxy, /supabase\.auth\.getUser\(\)/);
  assert.match(workspace, /\.eq\("user_id", user\.id\)/);
  assert.match(home, /getOrCreateDefaultWorkspace/);
  for (const route of [apps, agents, search]) assert.match(route, /await requireUser\(\)/);
});

test("credentials are accepted only by server actions and redirect destinations are local", () => {
  assert.match(login, /"use server"/);
  assert.match(login, /signInWithPassword/);
  assert.match(login, /signUp/);
  assert.match(login, /\["\/", "\/apps", "\/agents", "\/search"\]\.includes\(value\)/);
});
