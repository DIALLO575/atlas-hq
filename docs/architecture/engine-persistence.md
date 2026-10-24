# ATLAS Engine persistence — SHA-132 preconnection security proposal

**Status: proposal; NOT deployed, NOT a migration.** The SQL is stored at
`supabase/proposals/engine-foundation-preconnection.sql`, deliberately outside
`supabase/migrations/`. No changes have been applied to production project.
The connected Supabase CLI is not available here; promotion must be done with
`supabase migration new` in a reviewed local environment, followed by
`supabase db diff` / advisors and staging verification.

## Schema boundaries

| Table | Role | Browser access |
| --- | --- | --- |
| public.atlas_engine_instances | Workspace-bound engine metadata only | member SELECT, admin offline INSERT |
| public.atlas_engine_runs | Mission-bound engine execution metadata only | requester/admin SELECT |
| private.atlas_engine_agent_bindings | Mapping logical agent to remote engine identity | none |
| private.atlas_engine_credentials | Ciphertext + nonce + tag + key version, never token plaintext | none |
| private.atlas_engine_approvals | Human-reviewed decision with reviewer identity and expiration | none |
| private.atlas_engine_outbox | Encrypted payload, tenant-scoped idempotency key, retry/lease state | none |
| private.atlas_engine_event_cursors | Scoped stream cursor and optimistic revision | none |
| private.atlas_engine_event_receipts | Duplicate event guard (unique workspace/instance/event) | none |
| private.atlas_engine_audit_events | Append-only event digest and actor, not raw tool args | none |

All tables have RLS enabled. Private tables have no client grants and
no authenticated RLS policies; service_role alone gets narrowly scoped
permissions. Browser clients can NEVER create runs, approvals, outbox entries,
credentials or cursors. Composite foreign keys prohibit cross-workspace
instance, mission, run, user and event references even for service_role.

The outbox SQL trigger refuses transitions into leased/delivered unless:
the matching instance has state connected, the matching run is authorized
or leased, and a matching recorded human approval is approved and unexpired.
A plain `approved:true` request or env flag has no meaning to this trigger.
The requesting actor cannot approve their own run. Audit writes are immutable
by trigger and have no client UPDATE/DELETE grants.

## Verification

GitHub Actions runs a separate **ephemeral PostgreSQL 17** job:
`tests/sql/engine-foundation-fixture.sql`, the proposal, then
`tests/sql/engine-foundation-checks.sql`. Checks two-tenant RLS visibility,
forged activation, cross-tenant foreign keys, duplicate idempotency,
unapproved/offline dispatch rejection, approved dispatch preconditions,
no access to encrypted secrets, and audit immutability.

**Scope of proof:** SQL against disposable PostgreSQL only. It is NOT a
real Supabase RLS test with full auth claims, nor a sandbox MAUSBOT test.

## Release blockers

1. Verify the SQL under the latest Supabase Auth and RLS schema, and test
   real migrations on a disposable full Supabase instance.
2. Implement actor-session-verified human approval workflow with CSRF,
   resource-specific scopes and audit receipts, and prevent self-approval.
3. Build a trusted credential encrypt/decrypt vault, key rotation and
   service-role API that never exposes ciphertext to web clients.
4. Implement transactional outbox claim/retry/heartbeat/lease fencing and
   deduplicated cursor progress under worker identity; perform concurrent tests.
5. Bind runs to ATLAS missions, workspaces and live engine instances in
   server code, enforce owner/admin and separate read/write permissions.
6. Require explicit, reviewed release gating before changing an engine
   instance to connected. None of the existing MAUSBOT primitive execution
   endpoints automatically uses this proposed schema yet.
7. Verify local tests, staging, production security advisors, code review.
   Only then generate and apply the migration intentionally.

**Do not mark SHA-132 Done or open the MAUSBOT transport based solely
on this draft.** This is the durable SQL foundation, not the worker.
