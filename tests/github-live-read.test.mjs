import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, verify } from "node:crypto";
import {
  createGitHubAppJwt, mintReadOnlyInstallationToken, createGitHubReadClient, GitHubReadError,
} from "../packages/connectors/github/src/github-app-client.mjs";

const { publicKey, privateKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});
const now = () => Date.parse("2026-10-23T12:00:00Z");
const json = (value, status = 200, headers = {}) => new Response(JSON.stringify(value), {
  status, headers: { "content-type": "application/json", ...headers },
});
const repo = (id, full_name) => ({ id, full_name, private: true, default_branch: "main" });
const pr = (number, sha = "a".repeat(40)) => ({
  number, title: "Verify access", state: "open", draft: false, merged: false,
  updated_at: "2026-10-23T12:01:00Z", head: { sha }, body: "Review implementation",
});

test("creates a correctly signed, bounded RS256 GitHub App JWT", () => {
  const jwt = createGitHubAppJwt({ appId: 1234, privateKey, now });
  const [head, payload, signature] = jwt.split(".");
  assert.equal(JSON.parse(Buffer.from(head, "base64url").toString()).alg, "RS256");
  const claims = JSON.parse(Buffer.from(payload, "base64url").toString());
  assert.equal(claims.iss, "1234");
  assert.equal(claims.iat, Math.floor(now() / 1000) - 60);
  assert.equal(claims.exp, Math.floor(now() / 1000) + 540);
  assert.equal(verify("RSA-SHA256", Buffer.from(`${head}.${payload}`), publicKey, Buffer.from(signature, "base64url")), true);
  assert.throws(() => createGitHubAppJwt({ appId: 1, privateKey: "bogus", now }), /Invalid server-side/);
});

test("mints a selected-repository installation token with read-only permissions", async () => {
  const requests = [];
  const result = await mintReadOnlyInstallationToken({
    appId: "1234", privateKey: privateKey.replace(/\n/g, "\\n"),
    installationId: 77, repositoryIds: [101, 202], now,
    request: async (url, init) => {
      requests.push({ url, init });
      return json({ token: "ghs_fake", expires_at: "2026-10-23T13:00:00Z",
        permissions: { pull_requests: "read" }, repositories: [repo(101, "acme/first")] }, 201);
    },
  });
  assert.deepEqual(result, { token: "ghs_fake", expiresAt: "2026-10-23T13:00:00Z" });
  assert.equal(requests[0].url, "https://api.github.com/app/installations/77/access_tokens");
  assert.equal(requests[0].init.method, "POST");
  assert.equal(requests[0].init.cache, "no-store");
  assert.deepEqual(JSON.parse(requests[0].init.body), {
    repository_ids: [101, 202], permissions: { pull_requests: "read" },
  });
  assert.match(requests[0].init.headers.Authorization, /^Bearer eyJ/);
  assert.equal(requests[0].init.headers["X-GitHub-Api-Version"], "2026-03-10");
});

test("rejects unverified/unbounded repository selection before any GitHub request", async () => {
  for (const repositoryIds of [[], [0], [12, 12], ["12"], Array.from({ length: 501 }, (_, i) => i + 1)]) {
    await assert.rejects(mintReadOnlyInstallationToken({
      appId: 1, privateKey, installationId: 1, repositoryIds,
      request: () => { throw new Error("must not call provider"); },
    }), (error) => error instanceof GitHubReadError && error.code === "INVALID_INPUT");
  }
  await assert.rejects(mintReadOnlyInstallationToken({
    appId: 1, privateKey, installationId: 1, repositoryIds: [10],
    request: async () => json({ token: "x", expires_at: "2026-10-23T13:00:00Z",
      permissions: { pull_requests: "read" }, repositories: [repo(15, "other/secret")] }, 201),
  }), /exceeds approved/);
});

test("refuses expired tokens and insufficient GitHub App permissions", async () => {
  const input = { appId: 1, privateKey, installationId: 1, repositoryIds: [10], now };
  await assert.rejects(mintReadOnlyInstallationToken({
    ...input, request: async () => json({ token: "x", expires_at: "2026-10-23T11:00:00Z", permissions: { pull_requests: "read" } }, 201),
  }), /invalid installation token/);
  await assert.rejects(mintReadOnlyInstallationToken({
    ...input, request: async () => json({ token: "x", expires_at: "2026-10-23T13:00:00Z", permissions: {} }, 201),
  }), (error) => error.code === "PERMISSION_DENIED");
});

test("repository listing follows same-endpoint pagination and filters to selected IDs", async () => {
  const requests = [];
  const reader = createGitHubReadClient({ token: "secret-test", repositoryIds: [7, 9], request: async (url, init) => {
    requests.push({ url, init });
    if (url.includes("page=2")) return json({ repositories: [repo(9, "acme/nine")] });
    return json({ repositories: [repo(7, "acme/seven"), repo(8, "other/no-access")] }, 200, {
      link: '<https://api.github.com/installation/repositories?per_page=100&page=2>; rel="next"',
    });
  } });
  const result = await reader.listRepositories();
  assert.deepEqual(result.repositories.map((r) => r.id), [7, 9]);
  assert.equal(result.truncated, false);
  assert.equal(requests.length, 2);
  assert.ok(requests.every(({ init }) => init.method === "GET" && init.cache === "no-store"));
});

test("never follows a GitHub Link header to a different endpoint", async () => {
  let calls = 0;
  const reader = createGitHubReadClient({ token: "t", repositoryIds: [7], request: async () => {
    calls++;
    return json({ repositories: [repo(7, "acme/seven")] }, 200, {
      link: '<https://api.github.com/app/installations>; rel="next"',
    });
  } });
  const result = await reader.listRepositories();
  assert.equal(calls, 1);
  assert.equal(result.repositories.length, 1);
});

test("prevents access to repository IDs not bound to this installation", async () => {
  let calls = 0;
  const reader = createGitHubReadClient({ token: "t", repositoryIds: [7],
    request: async () => { calls++; throw new Error("should not fetch"); } });
  await assert.rejects(reader.getPullRequest(8, 1), (error) => error.code === "PERMISSION_DENIED");
  await assert.rejects(reader.listPullRequests(8), (error) => error.code === "PERMISSION_DENIED");
  assert.equal(calls, 0);
});

test("returns real-API-shaped PRs and pins context to the returned GitHub SHA", async () => {
  const calls = [];
  const reader = createGitHubReadClient({ token: "t", repositoryIds: [7], request: async (url) => {
    calls.push(url);
    if (url.includes("/installation/repositories")) return json({ repositories: [repo(7, "acme/seven")] });
    if (url.endsWith("/pulls?state=open&per_page=100")) return json([pr(42)]);
    if (url.endsWith("/pulls/42")) return json(pr(42));
    if (url.endsWith("/pulls/42/files?per_page=100")) return json([
      { filename: "src/index.ts", status: "modified", additions: 4, deletions: 1, patch: "@@ -1 +1 @@" },
    ]);
    throw new Error("unexpected endpoint");
  } });
  const list = await reader.listPullRequests(7);
  assert.equal(list.pullRequests[0].number, 42);
  const detail = await reader.getPullRequest(7, 42);
  assert.equal(detail.resource.provider, "github");
  assert.equal(detail.resource.installationRepositoryId, 7);
  assert.equal(detail.resource.headSha, "a".repeat(40));
  assert.equal(detail.files[0].path, "src/index.ts");
  assert.equal(detail.filesTruncated, false);
  assert.equal(calls.length, 5);
  assert.ok(calls.every((url) => url.startsWith("https://api.github.com/")));
});

test("rejects mismatch and missing source revision", async () => {
  const reader = createGitHubReadClient({ token: "t", repositoryIds: [7], request: async (url) =>
    url.includes("installation/repositories")
      ? json({ repositories: [repo(7, "acme/seven")] })
      : json(pr(41, "not-a-sha"))
  });
  await assert.rejects(reader.getPullRequest(7, 42), (error) => error.code === "INVALID_RESPONSE");
});

test("maps provider errors safely without logging tokens or response bodies", async () => {
  for (const [status, code, headers] of [[401, "AUTH_REQUIRED", {}], [403, "PERMISSION_DENIED", {}],
    [403, "RATE_LIMITED", { "retry-after": "60" }], [404, "NOT_FOUND_OR_HIDDEN", {}],
    [429, "RATE_LIMITED", {}], [503, "PROVIDER_UNAVAILABLE", {}]]) {
    const reader = createGitHubReadClient({
      token: "private-credential", repositoryIds: [7],
      request: async () => new Response("sensitive provider details", { status, headers }),
    });
    await assert.rejects(reader.listRepositories(), (error) => {
      assert.equal(error.code, code);
      assert.doesNotMatch(error.message, /private-credential|sensitive provider details/);
      return true;
    });
  }
});
