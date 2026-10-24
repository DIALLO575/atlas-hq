import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("server-only create wiring never leaks service role keys or provider tokens", async () => {
  const file = await read("../src/lib/github/studio-server.ts");
  assert.match(file, /import "server-only"/);
  assert.match(file, /adminGitHubClient/);
  assert.match(file, /createGitHubStudioOperationStore/);
  assert.match(file, /createRepositoryIntent/);
  assert.match(file, /verifyCreatedRepositoryAccess/);
  assert.match(file, /store\.finishWithAccess/);
  assert.match(file, /verifiedPersonalInstallation/);
  assert.doesNotMatch(file, /NEXT_PUBLIC_.*SERVICE_ROLE|console\./);
});

test("public Studio routes stay preview-only and cannot invoke the write coordinator", async () => {
  const route = await read("../src/app/api/apps/github/studio/repositories/preview/route.ts");
  const page = await read("../src/components/github-studio-repository-wizard.tsx");
  assert.doesNotMatch(route, /prepareGitHubStudioMutation|coordinateRepositoryCreation|adminGitHubClient/);
  assert.match(route, /canExecute: false/);
  assert.doesNotMatch(page, /repositories\/execute|prepareGitHubStudioMutation/);
});
