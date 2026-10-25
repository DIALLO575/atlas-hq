import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";
const read=(path)=>readFile(new URL(path,import.meta.url),"utf8");

test("preview obtains fresh GitHub installation permission without claiming execution",async()=>{
 const route=await read("../src/app/api/apps/github/studio/repositories/preview/route.ts");
 assert.match(route,/readStudioCreationPermission/);
 assert.match(route,/permissionState/);
 assert.match(route,/canExecute: false/);
 assert.doesNotMatch(route,/createPersonalRepository\(/);
});

test("human approval endpoint is sandbox-only, owner/admin-only and read-only",async()=>{
 const route=await read("../src/app/api/apps/github/studio/repositories/approve/route.ts");
 assert.match(route,/VERCEL_ENV !== "preview"/);
 assert.match(route,/ATLAS_GITHUB_STUDIO_APPROVAL_ENABLED !== "sandbox"/);
 assert.match(route,/request\.headers\.get\("origin"\)/);
 assert.match(route,/supabase\.auth\.getUser\(\)/);
 assert.match(route,/\["owner","admin"\]/);
 assert.match(route,/typedName !== draft\.name/);
 assert.match(route,/readStudioCreationPermission/);
 assert.match(route,/permission\.status !== "granted"/);
 assert.match(route,/issueStudioApprovalReceipt/);
 assert.match(route,/canExecute:false/);
 assert.doesNotMatch(route,/createPersonalRepository\(|executeSandboxRepositoryCreation\(/);
});

test("sandbox write path requires receipt, GitHub OAuth and explicit confirmation",async()=>{
 const route=await read("../src/app/api/apps/github/studio/repositories/execute/route.ts");
 assert.match(route,/VERCEL_ENV !== "preview"/);
 assert.match(route,/ATLAS_GITHUB_STUDIO_WRITE_ENABLED !== "sandbox"/);
 assert.match(route,/confirmed !== true/);
 assert.match(route,/checkStudioApprovalReceipt/);
 assert.match(route,/x-studio-approval/);
 assert.match(route,/readStudioUserGrant/);
 assert.match(route,/STUDIO_APPROVAL_REQUIRED/);
});
test("Studio UI resets review when editing, never calls execute and shows genuine permission states",async()=>{
 const ui=await read("../src/components/github-studio-repository-wizard.tsx");
 const css=await read("../src/app/github-control-center.css");
 assert.match(ui,/permissionState/);
 assert.match(ui,/setApproval\(null\)/);
 assert.match(ui,/setPreview\(null\)/);
 assert.match(ui,/typedName===preview\.preview\.name/);
 assert.match(ui,/fetch\("\/api\/apps\/github\/studio\/repositories\/approve"/);
 assert.match(ui,/idempotency-key/);
 assert.doesNotMatch(ui,/fetch\("\/api\/apps\/github\/studio\/repositories\/execute"/);
 assert.match(ui,/Création GitHub désactivée/);
 assert.match(css,/\.atlas-gh-studio-steps/);
 assert.match(css,/@media\(max-width:450px\)/);
 assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
});
