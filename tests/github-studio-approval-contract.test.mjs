import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
const read=(p)=>readFile(new URL(p,import.meta.url),"utf8");

test("preview checks live GitHub creation permission but performs no mutation",async()=>{
 const route=await read("../src/app/api/apps/github/studio/repositories/preview/route.ts");
 assert.match(route,/readStudioCreationPermission/);
 assert.match(route,/permissionState/);
 assert.match(route,/canExecute: false/);
 assert.match(route,/executionEnabled: studioMutationMode\(\) !== null/);
 assert.doesNotMatch(route,/createPersonalRepository\(/);
});
test("approval requires all-three-flags mode, current admin, exact typed name and permission probe",async()=>{
 const route=await read("../src/app/api/apps/github/studio/repositories/approve/route.ts");
 assert.match(route,/studioMutationMode\(\)/);
 assert.match(route,/studioSandboxBindingAllowed/);
 assert.match(route,/request.headers.get\("origin"\)/);
 assert.match(route,/supabase.auth.getUser\(\)/);
 assert.match(route,/\["owner","admin"\]/);
 assert.match(route,/typedName !== draft.name/);
 assert.match(route,/permission.status !== "granted"/);
 assert.match(route,/issueStudioApprovalReceipt/);
 assert.match(route,/canExecute:true/);
 assert.doesNotMatch(route,/createPersonalRepository\(|executeSandboxRepositoryCreation\(/);
});
test("production write path is still independently gated, OAuth-bound, approved and confirmed",async()=>{
 const route=await read("../src/app/api/apps/github/studio/repositories/execute/route.ts");
 assert.match(route,/studioMutationMode\(\)/);
 assert.match(route,/studioSandboxBindingAllowed/);
 assert.match(route,/confirmed !== true/);
 assert.match(route,/checkStudioApprovalReceipt/);
 assert.match(route,/x-studio-approval/);
 assert.match(route,/readStudioUserGrant/);
 assert.match(route,/STUDIO_APPROVAL_REQUIRED/);
});
test("Studio UI offers real creation only after permission, OAuth, approval and explicit click",async()=>{
 const ui=await read("../src/components/github-studio-repository-wizard.tsx");
 const css=await read("../src/app/github-control-center.css");
 assert.match(ui,/executionEnabled/);
 assert.match(ui,/setApproval\(null\)/);
 assert.match(ui,/typedName===preview.preview.name/);
 assert.match(ui,/fetch\("\/api\/apps\/github\/studio\/repositories\/approve"/);
 assert.match(ui,/fetch\("\/api\/apps\/github\/studio\/repositories\/execute"/);
 assert.match(ui,/studio\/oauth\/start/);
 assert.match(ui,/x-studio-approval/);
 assert.match(ui,/confirmed:true/);
 assert.match(ui,/idempotency-key/);
 assert.match(css,/\.atlas-gh-studio-oauth/);
});
