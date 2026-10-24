# GitHub Control Center (Atlas)

The /apps/github page is a compact read-only console backed by the existing authenticated workspace-scoped /api/apps/github API. No client-side installation token, service-role key or private key is exposed.

## Implemented
- Select only workspaces returned for the authenticated user (server-side membership query), with a separate control-center state per workspace.
- List verified installations; discover authorized repositories; list open PRs for the selected repository and fetch PR details with changed files and pinned head SHA.
- Search/filter repositories and PRs, follow provider links, refresh an installation, and initiate the existing administrative GitHub App installation flow.
- Display repository/PR counts ONLY for the selected installation/repository, handle pagination truncation and provider errors honestly.

## Not implemented (no misleading switches or buttons)
- Repository-wide/organization-wide PR totals, CI status, required approvals, code review submissions, merges, AI agent execution, automations and GitHub webhooks.
- A green 'verified' installation badge means the persisted ownership/repository checks succeeded; live HTTP availability is checked separately on each API read.
- Tests use mocked GitHub HTTP; a connected GitHub installation must still be exercised by an authorized user in production.

## Security
API routes validate user authentication, workspace membership, verified installation, repository IDs and server-side secrets. Read-only installation tokens are minted exclusively server-side, bounded to the verified repository selection. The GitHub setup form is restricted to workspace owners/admins with origin/state protection.


## V2 — Operational interface backed by the real read-only API
- Removed inactive Agents IA and Automations tabs; only overview, repositories, Pull Requests and connection settings remain.
- Protected installation action appears when there is no verified installation; GitHub App install needs admin/owner and configured OAuth credentials.
- Repository count is for the selected installation. Open PR count is only for the selected repository, never a fictional workspace total.
- GitHub accessible is shown after successful live repository read; stored authorization alone is not a live check.
- PR file patches are displayed as escaped text, with bounded progressive file listing (35 entries per page) and clear missing-diff messaging.
- In-flight requests are aborted when selecting another repository or switching workspace; provider errors are shown.
- Historical snapshot from 2026-10-23 recorded 0 installations / 0 authorized repositories. **Updated official Supabase snapshot on 2026-10-24: 1 recorded installation and 1 authorized repository.** Persistence alone is not proof of a successful real GitHub provider read; verification of current access and tenant isolation remains required.

## Compatibility
The read-only UI accepts both `selected` and `all` GitHub App repository grants, preserving the latest backend permissions and diagnostics on `main`.


## Release evidence and next worker (24 October 2026)
- Consolidated [PR #29](https://github.com/DIALLO575/atlas-hq/pull/29) merged into main as `832dce2` with Chief; PR #22 superseded/closed. Preview READY + `/apps/github` HTTP 200, **but production Vercel remains at db3152e** due deployment cap 402.
- Follow-up GitHub read/install/security evidence: [SHA-102](https://linear.app/shadoron/issue/SHA-102/05-developper-le-connecteur-produit-github-complet), [SHA-113](https://linear.app/shadoron/issue/SHA-113/052-implementer-linstallation-github-app-multi-tenant), [SHA-114](https://linear.app/shadoron/issue/SHA-114/053-implementer-les-lectures-github-et-le-contexte-pr-minimal), [SHA-116](https://linear.app/shadoron/issue/SHA-116/055-prouver-le-connecteur-github-en-sandbox-multi-tenant).
- [Worker handoff](../operations/worker-handoff-2026-10-24.md) tracks exact deployment state and next actions.
