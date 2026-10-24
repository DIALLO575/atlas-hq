import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("GitHub Studio preview is authenticated, tenant scoped and not a write operation", async () => {
  const route = await read("../src/app/api/apps/github/studio/repositories/preview/route.ts");
  assert.match(route, /export async function POST/);
  assert.match(route, /supabase\.auth\.getUser\(\)/);
  assert.match(route, /\.from\("workspace_members"\)/);
  assert.match(route, /\.eq\("workspace_id", draft\.workspaceId\)/);
  assert.match(route, /\["owner", "admin"\]/);
  assert.match(route, /\.from\("atlas_github_installations"\)/);
  assert.match(route, /verifiedPersonalInstallation/);
  assert.match(route, /"origin"/);
  assert.match(route, /canExecute: false/);
  assert.doesNotMatch(route, /createPersonalRepository\(/);
  assert.doesNotMatch(route, /mintReadOnlyInstallationToken|fetch\("https:\/\/api\.github\.com/);
});

test("existing GitHub read endpoint remains GET-only", async () => {
  const route = await read("../src/app/api/apps/github/route.ts");
  assert.match(route, /export async function GET/);
  assert.doesNotMatch(route, /export async function (POST|PUT|PATCH|DELETE)/);
});
