# SHA-154 — GitHub Studio durable operation ledger

Date 2026-10-24. **Commit pending review. Migration versioned, CI on disposable PostgreSQL; not applied to official Supabase.**

## Implementation
- `supabase/migrations/20261024215000_github_studio_operation_ledger.sql`: two RLS-protected tables, operations + append-only audit. No browser SELECT/INSERT/UPDATE/DELETE grants. No token or response body stored.
- A unique triple `(workspace_id, actor_id, idempotency_key)` protects repeat requests; a second partial unique index on `(workspace_id, installation_id, lower(repository_name)) WHERE state<>'failed'` additionally protects against re-generated request IDs.
- `public.atlas_gh_studio_reserve(...)`: service-role-only, validates live stored actor membership and installation binding, inserts intent and audit atomically, returns prior status on exact retries and rejects changed payloads.
- `public.atlas_gh_studio_advance(...)`: service-role-only CAS with `FOR UPDATE` row lock and strict expected state; audit INSERT shares the same SQL transaction. Selected grants require an explicit allowlisted repository ID for `succeeded`.
- No browser caller can make changes through these RPCs. **They do not send requests to GitHub.**

## Safety invariant
Only the winner of a successful `prepared → dispatching` transition may send a GitHub write. No automatic retry if GitHub's response is lost; mark `reconciliation_required`, independently verify repository ID and account, verify current GitHub App installation grant and persist/confirm workspace grant before allowing `succeeded`. `all` mode requires live GitHub provider verification in the future application adapter; a DB row alone does not prove the grant.

## Required before real creation
1. Review/install GitHub App `repository_creation:write` with user approval.
2. Implement trusted BFF execution handler calling these RPCs using service role after session, Origin and role checks; no operation if migration is absent.
3. Stronger reconciliation code: read GitHub installation's currently accessible repositories, resolve remote creation uncertain outcomes, prevent cross-tenant/stale installations and grant resync, no forced writes.
4. E2E test in sandbox: user consent, create a private repository, verify provider ID and grant, then status update. No production mutation now.
5. Apply the migration in a dedicated controlled change only after PostgreSQL CI is green and security review is complete. Do not silently apply through the preview or GitHub Actions.
6. Improve metrics/alerts for stuck `dispatching` and `reconciliation_required` states.

## Validation
CI uses PostgreSQL 17 disposable service with GitHub-installation fixture + actual migration: RLS/grants, duplicate key, same-name UUID, cross-workspace refusal, selected grant and atomic audit + competing dispatch processes. Run is visible on PR #43.

Official GitHub changelog (2026-10-13): https://github.blog/changelog/2026-10-13-github-app-improvements-for-least-privilege-and-management/
Project: https://linear.app/shadoron/project/atlas-github-studio-v1-creation-and-developpement-edd229a7477d
