import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migration = await readFile(new URL("../supabase/migrations/20261023210000_atlas_github_installations_rls.sql", import.meta.url), "utf8");
const route = await readFile(new URL("../src/app/api/apps/github/route.ts", import.meta.url), "utf8");
const reader = await readFile(new URL("../packages/connectors/github/src/authorized-reader.mjs", import.meta.url), "utf8");

test("GitHub installation records are NOT writable by users and are protected by RLS", () => {
  for (const name of ["atlas_github_installations", "atlas_github_authorized_repositories"]) {
    assert.match(migration, new RegExp(`create table if not exists public\\.${name}\\s*\\(`));
    assert.match(migration, new RegExp(`alter table public\\.${name} enable row level security`));
    assert.match(migration, new RegExp(`public\\.${name}`));
  }
  assert.match(migration, /revoke all privileges on public\.atlas_github_installations,[\s\S]*from public, anon, authenticated;/);
  assert.match(migration, /grant select on public\.atlas_github_installations,[\s\S]*to authenticated;/);
  assert.match(migration, /grant select, insert, update, delete on public\.atlas_github_installations,[\s\S]*to service_role;/);
  assert.match(migration, /private\.is_workspace_member\(workspace_id\)/);
  assert.match(migration, /private\.is_workspace_member\(i\.workspace_id\)/);
  assert.doesNotMatch(migration, /grant (?:insert|update|delete|all)\b[^;]*\bto authenticated;/i);
});

test("ready state is impossible without both ownership proof and repository verification", () => {
  assert.match(migration, /constraint github_ready_requires_proof check/);
  assert.match(migration, /status <> 'repositories-ready'/);
  assert.match(migration, /repository_selection = 'selected'/);
  assert.match(migration, /ownership_verified_at is not null/);
  assert.match(migration, /repositories_verified_at is not null/);
  assert.match(migration, /installation_id bigint primary key check \(installation_id > 0\)/);
  assert.match(migration, /primary key \(installation_id, repository_id\)/);
});

test("route derives a trusted user session and validates workspace membership before GitHub", () => {
  assert.match(route, /export async function GET\(request: NextRequest\)/);
  assert.match(route, /supabase\.auth\.getUser\(\)/);
  const membership = route.indexOf('.from("workspace_members")');
  const installation = route.indexOf('.from("atlas_github_installations")');
  const transport = route.indexOf("createAuthorizedGitHubReader({");
  assert.ok(membership !== -1 && installation > membership && transport > installation);
  assert.match(route, /\.eq\("user_id", user\.id\)\.eq\("workspace_id", workspaceId\)/);
  assert.match(route, /\.eq\("installation_id", installationId\)\.eq\("workspace_id", workspaceId\)/);
  assert.match(route, /\.from\("atlas_github_authorized_repositories"\)/);
  assert.match(route, /\bstatus !== "repositories-ready"/);
  assert.match(route, /\brepositories_verified_at/);
  assert.match(route, /\bprocess\.env\.GITHUB_APP_PRIVATE_KEY/);
  assert.match(route, /"Cache-Control": "no-store"/);
  assert.doesNotMatch(route, /service_role|supabaseServiceRole|NEXT_PUBLIC_GITHUB_APP_PRIVATE_KEY|grant.+scope/);
  assert.match(reader, /record\.status !== "repositories-ready"/);
});

test("the route has no write APIs, setup endpoints or token disclosures", () => {
  assert.doesNotMatch(route, /export async function (?:POST|PUT|PATCH|DELETE)/);
  assert.doesNotMatch(route, /\.insert\(|\.update\(|\.upsert\(|\.delete\(/);
  assert.doesNotMatch(route, /return success\(\{\s*token\s*:/);
  assert.match(route, /return fail\("WORKSPACE_FORBIDDEN", 403\)/);
  assert.match(route, /return fail\("GITHUB_NOT_AUTHORIZED", 403\)/);
  assert.match(route, /if \(!appId \|\| !privateKey\) return fail\("GITHUB_NOT_CONFIGURED", 503\)/);
});
