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
- Observed Supabase read-only state 2026-10-23: 0 GitHub installations, 0 authorized repositories. Real workspace data cannot appear until GitHub App installation is completed.

## Compatibility
The read-only UI accepts both `selected` and `all` GitHub App repository grants, preserving the latest backend permissions and diagnostics on `main`.
