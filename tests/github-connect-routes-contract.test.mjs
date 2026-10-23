import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");
const [start, setup, oauth, auth, migration, ui, verifier] = await Promise.all([
  read("../src/app/api/apps/github/connect/start/route.ts"),
  read("../src/app/api/apps/github/connect/setup/route.ts"),
  read("../src/app/api/apps/github/connect/oauth/route.ts"),
  read("../src/lib/github/connect.ts"),
  read("../supabase/migrations/20261023213000_atlas_github_connect_attempts.sql"),
  read("../src/components/github-connection.tsx"),
  read("../packages/connectors/github/src/user-installation-verification.mjs"),
]);

test("connect start checks origin and authenticated admin membership before GitHub", () => {
  assert.match(start, /request\.headers\.get\("origin"\) !== settings\.publicOrigin/);
  assert.match(start, /requireWorkspaceAdmin\(workspaceId\)/);
  assert.ok(start.indexOf("requireWorkspaceAdmin(workspaceId)") < start.indexOf("registerConnectAttempt(admin"));
  assert.match(start, /stage: "installation"/);
  assert.match(start, /httpOnly: true/);
  assert.match(start, /sameSite: "lax"/);
  assert.match(start, /buildGitHubAppInstallUrl/);
  assert.doesNotMatch(start, /service_role|NEXT_PUBLIC_GITHUB/);
});

test("GitHub setup callback does not trust installation_id until OAuth proof", () => {
  assert.match(setup, /cookieState/);
  assert.match(setup, /parsed\.installationId/);
  assert.match(setup, /consumeConnectAttempt/);
  assert.match(setup, /stage: "installation"/);
  assert.match(setup, /stage: "oauth"/);
  assert.match(setup, /githubUserOAuthUrl/);
  assert.doesNotMatch(setup, /persistVerifiedPersonalInstallation|repositories-ready/);
});

test("OAuth callback checks one-time nonce before exchanging code and persisting", () => {
  assert.match(oauth, /state !== cookieState/);
  assert.match(oauth, /requireWorkspaceAdmin\(proof\.tenantId\)/);
  assert.match(oauth, /stage: "oauth"/);
  assert.ok(oauth.indexOf("consumeConnectAttempt(") < oauth.indexOf("exchangeGitHubAppCode("));
  assert.ok(oauth.indexOf("exchangeGitHubAppCode(") < oauth.indexOf("verifyPersonalInstallation("));
  assert.ok(oauth.indexOf("verifyPersonalInstallation(") < oauth.indexOf("persistVerifiedPersonalInstallation("));
  assert.doesNotMatch(oauth, /return success\(\{\s*token/);
});

test("server-only attempt ledger is replay resistant and has no browser policy", () => {
  assert.match(migration, /stage text not null check/);
  assert.match(migration, /state_hash text primary key/);
  assert.match(migration, /revoke all privileges on public\.atlas_github_connect_attempts from public, anon, authenticated/);
  assert.match(migration, /grant select, insert, update, delete on public\.atlas_github_connect_attempts to service_role/);
  assert.doesNotMatch(migration, /grant.+to authenticated/);
  assert.match(auth, /\.eq\("state_hash", stateHash\(args\.state\)\)/);
  assert.match(auth, /\.eq\("user_id", args\.userId\)/);
  assert.match(auth, /\.eq\("stage", args\.stage\)/);
  assert.match(auth, /\.gt\("expires_at", new Date\(\)\.toISOString\(\)\)/);
  assert.match(auth, /status: "active"/);
  assert.match(auth, /status: "repositories-ready"/);
  assert.match(auth, /existing\.workspace_id !== workspaceId/);
});

test("Mes Apps uses real APIs while refusing to advertise unconfigured capabilities", () => {
  assert.match(ui, /\/api\/apps\/github\?/);
  assert.match(ui, /\/api\/apps\/github\/connect\/start/);
  assert.match(ui, /isConfigured/);
  assert.match(ui, /GitHub App ATLAS HQ n’est pas encore configurée/);
  assert.match(verifier, /item\?\.account\?\.id === person\.id/);
});
