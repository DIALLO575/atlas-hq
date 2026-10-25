import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";
const read=(p)=>readFile(new URL(p,import.meta.url),"utf8");
test("trusted server coordinator does not expose service role or provider credentials to browser",async()=>{
 const server=await read("../src/lib/github/studio-server.ts");
 assert.match(server,/import "server-only"/);
 assert.match(server,/adminGitHubClient/);
 assert.match(server,/createGitHubStudioOperationStore/);
 assert.match(server,/createRepositoryIntent/);
 assert.match(server,/verifyCreatedRepositoryAccess/);
 assert.match(server,/store.finishWithAccess/);
 assert.match(server,/verifiedPersonalInstallation/);
 assert.doesNotMatch(server,/NEXT_PUBLIC_.*SERVICE_ROLE|console\./);
});
test("preview remains a read-only operation even when execute path is available",async()=>{
 const route=await read("../src/app/api/apps/github/studio/repositories/preview/route.ts");
 const page=await read("../src/components/github-studio-repository-wizard.tsx");
 assert.doesNotMatch(route,/prepareGitHubStudioMutation|coordinateRepositoryCreation|adminGitHubClient/);
 assert.match(route,/canExecute: false/);
 assert.match(page,/studio\/repositories\/execute/);
});
