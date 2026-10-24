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

## Consolidated server-side usage (PR #4 + PR #10)

Use the `authorized-reader.mjs` boundary rather than passing browser-supplied
installation IDs or repository IDs to a token minting function. The `lookup` port
must be implemented by a trusted server-side datastore with tenant/workspace
authorization; it is **not implemented by this branch**.

```js
import { createAuthorizedGitHubReader } from
  "@atlas-hq/connector-github-contract/authorized-reader";

// Derive tenantId from the authenticated Supabase session and membership.
// Resolve installationId from a verified connection record, not query params.
const github = await createAuthorizedGitHubReader({
  tenantId,
  installationId,
  lookup: async ({ tenantId, installationId }) =>
    loadVerifiedInstallationForWorkspace(tenantId, installationId),
  appId: serverConfig.githubAppId,
  privateKey: await readServerSecret("github-app-private-key"),
});
const { repositories } = await github.listRepositories();
const { pullRequests } = await github.listPullRequests(repositories[0].id);
const context = await github.getPullRequest(repositories[0].id, pullRequests[0].number);
```

The example's persistence and configuration functions are **placeholders** and are
not provided by this PR. The bridge checks tenant/installation identity,
`repositories-ready`, explicit `selected` repository access, and nonempty unique
numeric repository IDs before issuing a narrowly scoped installation token.
The caller receives only read methods, not the token. In a production deployment,
a server-side store must also implement revocation and authoritative revalidation
of changes to provider installation grants.

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

## All repositories (2026-10-24)

ATLAS supports both verified personal-account installation grants: `selected`
and `all`. Owner verification always requires GitHub App OAuth and a matching
GitHub user, App ID and personal installation; setup callback arguments are not
authorization evidence.

- **Selected:** Up to 500 distinct repository IDs are verified and persisted.
  The read token is restricted to those IDs and pull_requests:read.
- **All:** No repository IDs are persisted as a stale allowlist. The server
  persists the `all` grant only after real OAuth ownership proof. Each read
  mints an installation token with `pull_requests:read` only and **without**
  a repository_ids field; GitHub limits it to repositories of that installation.
  Each repository or PR request checks the current `/installation/repositories`
  response using that token, including any future repositories granted through
  the installation. Client repository IDs alone never authorize an operation.
- Up to 500 repositories are displayed in one bounded paginated listing.
  Larger installations may show a truncated listing instead of claiming all
  repositories were loaded; unlisted IDs are not accessed.
- Only authenticated Workspace members can browse, and only verified owners
  or admins can connect. All GitHub reads stay read-only. Existing explicit
  server-side service-role and RLS boundaries remain in effect.

Important: `All repositories` grants the GitHub App access to every
current and future repository of the chosen account. Grant only if desired,
and reduce the app's registered permissions to minimum read access. Any
existing broad GitHub App permissions must be corrected in the GitHub App
settings separately; ATLAS narrows its generated installation token.
