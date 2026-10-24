import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
const read = (p) => readFile(new URL(p, import.meta.url), "utf8");

test("execute endpoint remains disabled in production regardless of flags",async()=>{
  const s=await read("../src/app/api/apps/github/studio/repositories/execute/route.ts");
  assert.match(s,/process\.env\.VERCEL_ENV !== "preview"/);
  assert.match(s,/process\.env\.ATLAS_GITHUB_STUDIO_WRITE_ENABLED !== "sandbox"/);
  assert.match(s,/STUDIO_DISABLED/);
  assert.match(s,/ATLAS_GITHUB_STUDIO_SANDBOX_WORKSPACE_ID/);
  assert.match(s,/ATLAS_GITHUB_STUDIO_SANDBOX_INSTALLATION_ID/);
  assert.match(s,/confirmed !== true/);
  assert.match(s,/idempotency-key/);
  assert.match(s,/request\.headers\.get\("origin"\)/);
  assert.match(s,/supabase\.auth\.getUser\(\)/);
  assert.match(s,/\["owner", "admin"\]/);
  assert.match(s,/verifiedPersonalInstallation/);
  assert.match(s,/executeSandboxRepositoryCreation/);
  assert.doesNotMatch(s,/service_role|GITHUB_APP_PRIVATE_KEY|console\./);
});
test("public UI and preview remain explicitly nonexecuting",async()=>{
  const ui=await read("../src/components/github-studio-repository-wizard.tsx");
  const preview=await read("../src/app/api/apps/github/studio/repositories/preview/route.ts");
  assert.doesNotMatch(ui,/repositories\/execute/);
  assert.match(ui,/Création GitHub désactivée/);
  assert.match(preview,/canExecute: false/);
  assert.doesNotMatch(preview,/executeSandboxRepositoryCreation/);
});
