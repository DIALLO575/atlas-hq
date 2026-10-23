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
