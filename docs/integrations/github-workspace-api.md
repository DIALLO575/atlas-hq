# GitHub Workspace API — implementation boundary

This increment extends the existing GitHub App installation + REST client on PR #4.
It adds **a versioned Supabase migration and an authenticated, read-only Next.js route**.
It does not install/configure the GitHub App or mark an unverified connection as live.

## Existing database caution

The official Supabase project already contains `public.atlas_connections` with
owner-editable records. Do **NOT** use its `status`, `granted_scopes` or
`secret_ref` as proof of a GitHub App installation. This increment adds separate
server-controlled tables `atlas_github_installations` and
`atlas_github_authorized_repositories` with select-only RLS for workspace members.
All writes must be performed by a narrowly scoped, authenticated server-side
verification/sync flow **not yet implemented**.

Migration: `supabase/migrations/20261023210000_atlas_github_installations_rls.sql`.
It has been committed for review, **not applied to the official project**.
Validate in a disposable Supabase database before applying; do not reorder existing
production migrations. Check the security and performance advisors after testing.

## Read API

`GET /api/apps/github?workspaceId=<uuid>&view=connections`
- Returns installation *database records* visible to the authenticated Workspace member.
- `isLive: false` is intentional. There is no live health check in this view.

`GET /api/apps/github?workspaceId=<uuid>&view=repositories&installationId=<id>`
- Requires the installation record to be `repositories-ready`, with
  selected repositories, verified ownership and repository verification times.
- Requires 1–500 explicit repository IDs persisted in the protected table.
- Uses the server GitHub App private key to mint a short-lived restricted token.

`GET /api/apps/github?workspaceId=<uuid>&view=pulls&installationId=<id>&repositoryId=<id>`
- Lists open pull requests in an authorized repository.

`GET /api/apps/github?workspaceId=<uuid>&view=pull&installationId=<id>&repositoryId=<id>&pullNumber=<number>`
- Retrieves the PR and changed files; output includes pinned GitHub head SHA.

All routes verify Supabase `auth.getUser()`, membership, RLS-filtered
installation authorization and selected repository IDs **before making any GitHub
request**. Errors are normalized and no secrets are included in JSON responses.
The route is a server-only, dynamic Node.js GET endpoint with `no-store` responses.

## Protected environment settings

- `GITHUB_APP_ID`
- `GITHUB_APP_PRIVATE_KEY` (PEM, as a protected server secret; escaped newlines accepted)

Never prefix these with `NEXT_PUBLIC_`. Do not put actual credentials in Git,
`.env.example`, a screenshot, agent prompt or user-visible logs.

## Not yet implemented / test gates

1. A registered GitHub App and verified production ownership callback.
2. A trusted service that can write approved installation records and revoke
   them on app uninstall/repository changes. **Browser writes remain forbidden**.
3. GitHub user authorization flow and proof that the installation belongs to
   the person connecting it. The previous SHA-113 ledger is in-memory only.
4. Database integration tests proving cross-workspace RLS and service writes
   on a disposable database. Current Node tests assert code/SQL contracts only.
5. A Mes Apps GitHub interface that uses this endpoint, with honest unavailable
   and disconnected states. A successful API integration test with real credentials.
6. Signed webhook ingress, persistent delivery deduplication/reconciliation, MCP
   and OpenMausBot mission dispatch. None is silently enabled.

The API deliberately fails closed until trusted installation records exist.
