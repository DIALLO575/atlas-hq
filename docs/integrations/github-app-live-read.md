# GitHub App REST data plane — server only (2026-10-23)

This branch adds executable, real-HTTP GitHub App operations in
`packages/connectors/github/src/github-app-client.mjs`.
It replaces neither the PR #4 installation flow nor the existing read-only capability contract.

## Implemented

- Generate a short-lived signed RS256 GitHub App JWT from a **server-only** private key.
- Exchange the JWT for an **installation token scoped to explicit verified repository IDs** and `pull_requests:read`.
- Reject absent, duplicated, invalid or overbroad repository selections before contacting GitHub.
- List the installation's permitted repositories, using GitHub REST pagination.
- List open pull requests in a repository **only after checking it is included in the installation listing**.
- Fetch a PR and its changed-file patches, with the PR head SHA pinned in its resource reference.
- Treat API errors as normalized safe errors; never return raw error bodies or credentials.
- Use `cache: no-store` and GitHub's pinned REST API version.
- Offline Node tests cover JWT signatures, token scoping, pagination, tenant isolation and error handling.

## Server-side usage

```js
import {
  mintReadOnlyInstallationToken,
  createGitHubReadClient,
} from "@atlas-hq/connector-github-contract/github-app-client";

// appId, privateKey and installationId must be resolved server-side.
// repositoryIds MUST come from a durable and verified workspace/installation binding,
// never from an untrusted request parameter, GitHub setup callback alone or browser state.
const { token } = await mintReadOnlyInstallationToken({
  appId, privateKey, installationId, repositoryIds,
});
const github = createGitHubReadClient({ token, installationId, repositoryIds });
const { repositories } = await github.listRepositories();
const { pullRequests } = await github.listPullRequests(repositories[0].id);
const context = await github.getPullRequest(repositories[0].id, pullRequests[0].number);
```

The above is an integration example, **not an ATLAS API route already connected to a user**. Do not supply arbitrary installation IDs or repo IDs from the browser.

## Required before enabling Mes Apps → GitHub

1. Create the official ATLAS HQ GitHub App and configure **selected repositories** and **Pull requests: read**. Put the App ID/private key in protected server configuration, not in Git or `NEXT_PUBLIC_*`.
2. Finish and review PR #4's ownership-confirmation process. GitHub setup parameters (especially `installation_id`) are **not proof of ownership**.
3. Persist a verified, tenant/workspace-scoped installation binding and the authorized repository IDs with Supabase RLS; implement revocation, reconnection and installation lifecycle handling.
4. Build authenticated Next.js endpoints that derive user/workspace membership from a verified Supabase session and load only the approved installation and repository IDs from server storage.
5. Render live repositories and PR details in Mes Apps only when those endpoints succeed. Otherwise show disconnected/unavailable, never fake a connection.
6. Implement signed GitHub webhook reception, replay-resistant durable delivery storage and reconciliation. This change does not receive webhooks.
7. Connect a real OpenMausBot transport/MCP tool execution only after permission-filtering and auditing are in place; this branch does not dispatch agent missions.

## Verification boundary

`npm test` exercises an **injected fake HTTP transport**, not a GitHub installation.
This branch alone does **not** make an OAuth installation, production service route, webhook, MCP tool or connected account operational. The data-plane client does execute real REST calls when supplied with valid server credentials and a trusted binding.

GitHub App documentation:
- https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-an-installation-access-token-for-a-github-app
- https://docs.github.com/en/rest/apps/installations
- https://docs.github.com/en/rest/pulls/pulls
