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

## End-to-end connection flow (new, pending live credentials and migrations)

1. **Mes Apps → GitHub → Connecter** submits a same-origin POST at
   `/api/apps/github/connect/start`. The authenticated user must be an owner
   or admin of the selected Workspace. A signed 15-minute state is recorded
   in the server-only `atlas_github_connect_attempts` ledger and bound to an
   HttpOnly SameSite=Lax cookie. No browser may write an installation grant.
2. GitHub App install UI uses the **Setup URL**
   `https://<ATLAS_HOST>/api/apps/github/connect/setup`. The callback
   verifies the state against the cookie, authenticated actor, Workspace,
   single-use ledger, and expected setup action. It does not trust
   `installation_id` as ownership evidence.
3. ATLAS starts **GitHub App user OAuth** with
   `https://github.com/login/oauth/authorize` and a fresh signed state.
   Configure GitHub App **Callback URL** to
   `https://<ATLAS_HOST>/api/apps/github/connect/oauth`.
   The GitHub App must use **Setup URL mode**; do not enable
   "Request user authorization (OAuth) during installation" because that
   replaces this setup redirect.
4. Server exchanges the OAuth code for a **temporary user access token**.
   It queries `GET /user`, `GET /user/installations`, and
   `GET /user/installations/{installation_id}/repositories`, rejecting
   mismatched app IDs, wrong personal account, suspended installations,
   all-repositories selection, and out-of-range or incomplete repository
   listings. **Organization installations are deliberately not supported
   by this first connection flow**; they require verified org-admin handling.
   The user access token is not persisted to ATLAS HQ.
5. Only after that proof may the server write the verified installation and
   the selected repository IDs in Supabase. Writes progress
   `active → repositories-ready`, failing closed if a write fails. Any
   collision with an installation already attached to a different Workspace
   is rejected, never reassigned implicitly.
6. The GitHub explorer calls the authenticated read-only
   `/api/apps/github` API to load repositories, PRs and changed files.

Additional migration:
`supabase/migrations/20261023213000_atlas_github_connect_attempts.sql`.
**Both new GitHub migrations must be reviewed and tested against a disposable
Supabase instance before being applied to the official project. They have
NOT been applied here.** Live integration also requires a registered GitHub
App with the correct settings and a deployment with server-only secrets.

Required secure server configuration:

- `ATLAS_PUBLIC_ORIGIN` — canonical `https://...` origin for callbacks;
- `GITHUB_APP_SLUG` — public GitHub App slug;
- `GITHUB_APP_ID` — numeric GitHub App ID;
- `GITHUB_APP_PRIVATE_KEY` — server-side PEM private key;
- `GITHUB_OAUTH_CLIENT_ID` and `GITHUB_OAUTH_CLIENT_SECRET` — app OAuth
  credentials (not interchangeable with GitHub App ID);
- `GITHUB_INSTALL_STATE_KEY` — random HMAC secret of at least 32 characters;
- `SUPABASE_SERVICE_ROLE_KEY` — **server only**, needed for trusted database
  transitions; not used for regular user requests or client-side reads;
- `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.

Known boundaries: no GitHub organization-admin authorization, webhook
ingress, background revocation/synchronization, MCP or MausBot in this change.
The proof is only as fresh as its latest successful authorization; the
explorer enforces GitHub access again at request time. Provider and RLS
integration testing must precede production enablement.
