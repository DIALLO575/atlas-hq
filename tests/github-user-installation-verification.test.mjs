import test from "node:test";
import assert from "node:assert/strict";
import { exchangeGitHubAppCode, verifyPersonalInstallation, GitHubAuthorizationError, githubUserOAuthUrl }
  from "../packages/connectors/github/src/user-installation-verification.mjs";

const ok = (data, headers = {}) => new Response(JSON.stringify(data), {
  status: 200, headers: { "content-type": "application/json", ...headers },
});
const owner = { id: 15, login: "atlas-tester" };
const installation = {
  id: 77, app_id: 123, account: owner, target_type: "User", suspended_at: null,
  repository_selection: "selected", permissions: { pull_requests: "read" },
};
const selected = { total_count: 2, repositories: [{ id: 101 }, { id: 202 }] };
const fixture = (override = {}) => async (url) => {
  if (url === "https://api.github.com/user") return ok(owner);
  if (url.includes("/user/installations/77/repositories")) return ok(override.repos ?? selected);
  if (url.includes("/user/installations?")) return ok({
    total_count: 1, installations: [override.installation ?? installation],
  });
  throw new Error("Unexpected request");
};

test("exchanges OAuth code only against fixed GitHub endpoint; never returns secret details", async () => {
  let inspected = false;
  const token = await exchangeGitHubAppCode({
    code: "a".repeat(20), clientId: "client", clientSecret: "server-secret",
    redirectUri: "https://atlas.example/api/apps/github/connect/oauth",
    request: async (url, init) => {
      assert.equal(url, "https://github.com/login/oauth/access_token");
      assert.equal(init.method, "POST");
      assert.equal(JSON.parse(init.body).client_secret, "server-secret");
      inspected = true;
      return ok({ access_token: "ghu-temp" });
    },
  });
  assert.equal(inspected, true);
  assert.equal(token, "ghu-temp");
  await assert.rejects(exchangeGitHubAppCode({
    code: "bad", clientId: "client", clientSecret: "server-secret", redirectUri: "https://atlas.example",
    request: async () => { throw new Error("must not call GitHub"); },
  }), (error) => error.code === "GITHUB_OAUTH_INVALID");
  const url = new URL(githubUserOAuthUrl({
    clientId: "client", redirectUri: "https://atlas.example/api/apps/github/connect/oauth", state: "state",
  }));
  assert.equal(url.origin, "https://github.com");
  assert.equal(url.pathname, "/login/oauth/authorize");
  assert.equal(url.searchParams.get("state"), "state");
});

test("verifies a personal installation owned by the authorized GitHub user", async () => {
  const verified = await verifyPersonalInstallation({
    userToken: "temporary", appId: 123, installationId: 77, request: fixture(),
  });
  assert.deepEqual(verified, {
    installationId: 77, repositoryIds: [101, 202], accountLogin: "atlas-tester",
  });
});

test("organization, collaborator, wrong app, suspended and all-repositories claims fail closed", async () => {
  const variants = [
    { ...installation, target_type: "Organization" },
    { ...installation, account: { id: 1234, login: "another" } },
    { ...installation, app_id: 999 },
    { ...installation, suspended_at: "2026-10-23" },
    { ...installation, repository_selection: "all" },
    { ...installation, permissions: {} },
  ];
  for (const item of variants) {
    await assert.rejects(verifyPersonalInstallation({
      userToken: "temporary", appId: 123, installationId: 77,
      request: fixture({ installation: item }),
    }), (error) => error instanceof GitHubAuthorizationError &&
      ["GITHUB_INSTALLATION_NOT_OWNED", "GITHUB_INSTALLATION_SUSPENDED",
       "GITHUB_REPOSITORY_SELECTION_REQUIRED", "GITHUB_PULL_REQUESTS_PERMISSION_REQUIRED"].includes(error.code));
  }
});

test("invalid, missing and duplicated repository IDs are refused", async () => {
  for (const repos of [
    { total_count: 0, repositories: [] },
    { total_count: 2, repositories: [{ id: 3 }, { id: 3 }] },
    { total_count: 1, repositories: [{ id: "3" }] },
    { total_count: 2, repositories: [{ id: 3 }] },
    { total_count: 501, repositories: [{ id: 3 }] },
  ]) {
    await assert.rejects(verifyPersonalInstallation({
      userToken: "temporary", appId: 123, installationId: 77,
      request: fixture({ repos }),
    }), GitHubAuthorizationError);
  }
});

test("invalid pagination is not followed and incomplete lists fail closed", async () => {
  let calls = 0;
  await assert.rejects(verifyPersonalInstallation({
    userToken: "temporary", appId: 123, installationId: 77,
    request: async (url) => {
      calls++;
      if (url.endsWith("/user")) return ok(owner);
      if (url.includes("/user/installations?")) return ok({ total_count: 2, installations: [installation] },
        { link: '<https://evil.test/token>; rel="next"' });
      if (url.includes("/user/installations/77/repositories")) return ok(selected);
      throw new Error("unexpected URL");
    },
  }), GitHubAuthorizationError);
  assert.equal(calls, 2);
});
