import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("Workspace creator can INSERT ... RETURNING id while owner membership is assigned", async () => {
  const [migration, rlsTests, action] = await Promise.all([
    read("../supabase/migrations/20261023222857_workspace_insert_returning_owner_rls.sql"),
    read("../supabase/tests/workspace_rls.sql"),
    read("../src/app/workspaces/actions.ts"),
  ]);

  assert.match(migration, /alter policy workspaces_read_member on public\.workspaces/);
  assert.match(migration, /created_by = \(select auth\.uid\(\)\)/);
  assert.match(migration, /private\.is_workspace_member\(id\)/);
  assert.doesNotMatch(migration, /using \(true\)|disable row level security|grant .* to anon/i);
  assert.match(rlsTests, /values \('User A fresh workspace', auth\.uid\(\)\)/);
  assert.match(rlsTests, /returning id into created_id/);
  assert.match(rlsTests, /role = 'owner'/);
  assert.match(rlsTests, /delete from public\.workspaces where id = created_id/);
  assert.match(action, /created_by: resolved\.userId/);
  assert.match(action, /\.select\("id"\)\.single\(\)/);
});
