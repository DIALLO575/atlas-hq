import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { githubOAuthFailureOutcome } from "../packages/connectors/github/src/oauth-diagnostics.mjs";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("OAuth diagnostics are allowlisted by error code and stage", () => {
  assert.equal(githubOAuthFailureOutcome("verification", "GITHUB_REPOSITORY_SELECTION_REQUIRED"), "select-repositories");
  assert.equal(githubOAuthFailureOutcome("verification", "GITHUB_NO_REPOSITORIES"), "no-repositories");
  assert.equal(githubOAuthFailureOutcome("verification", "GITHUB_INSTALLATION_NOT_OWNED"), "installation-not-owned");
  assert.equal(githubOAuthFailureOutcome("verification", "GITHUB_PULL_REQUESTS_PERMISSION_REQUIRED"), "pull-request-permission-required");
  assert.equal(githubOAuthFailureOutcome("exchange", "GITHUB_OAUTH_INVALID"), "oauth-invalid");
  assert.equal(githubOAuthFailureOutcome("persistence", "ATLAS_INTERNAL_ERROR"), "storage-unavailable");
  assert.equal(githubOAuthFailureOutcome("verification", "oauth-token-THIS-IS-SECRET"), "verification-failed");
  assert.equal(githubOAuthFailureOutcome("persistence", "another-secret"), "storage-unavailable");
});

test("OAuth callback safely logs diagnostics and returns directly to the GitHub Control Center", async () => {
  const [route, conn, page] = await Promise.all([
    read("../src/app/api/apps/github/connect/oauth/route.ts"),
    read("../src/lib/github/connect.ts"),
    read("../src/app/apps/github/page.tsx"),
  ]);
  assert.match(route, /GitHubAuthorizationError/);
  assert.match(route, /ATLAS_GITHUB_OAUTH_FAILURE/);
  assert.match(route, /stage = "verification"/);
  assert.match(route, /stage = "persistence"/);
  assert.match(route, /githubOAuthFailureOutcome\(stage, safeReason\)/);
  assert.doesNotMatch(route, /console\.(log|warn|error)\(.*(userToken|clientSecret|code,)/);
  assert.match(conn, /new URL\("\/apps\/github", settings\.publicOrigin\)/);
  assert.match(page, /searchParams: Promise<\{ workspaceId\?: string; github\?: string; studioAuth\?: string \}>/);
  assert.match(page, /githubResult &&/);
  assert.match(page, /Only select repositories/);
});
