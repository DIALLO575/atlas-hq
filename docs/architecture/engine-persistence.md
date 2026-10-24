# ATLAS Engine persistence — SHA-132: migrations applied, runtime blocked

**Status: migration applied to the connected ATLAS Supabase project on 2026-10-24.**
The versioned SQL is `supabase/migrations/20261024161305_atlas_engine_foundation_preconnection.sql` and is recorded in the Supabase
migration history under `20261024161305` (via the connected Supabase migration API).
After applying, read-only verification confirmed 9 new tables, RLS on all,
3 guard triggers, 0 engine instances and 0 runs. Production transport remains **disconnected**. An AES-256-GCM offline crypto
module exists, but KMS, privileged database driver, real actor approvals
and a durable worker are not yet implemented.

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
`tests/sql/engine-foundation-fixture.sql`, the versioned migration, then
`tests/sql/engine-foundation-checks.sql`. Checks two-tenant RLS visibility,
forged activation, cross-tenant foreign keys, duplicate idempotency,
unapproved/offline dispatch rejection, approved dispatch preconditions,
no access to encrypted secrets, and audit immutability.

**Scope of proof:** the full SQL test suite runs against disposable PostgreSQL,
and the live Supabase database was checked read-only for tables, policy grants,
triggers and empty engine state. No authenticated-user end-to-end or MAUSBOT
sandbox validation has been performed.

## Release blockers

1. Test real authenticated-user RLS policies against an isolated full Supabase environment, including revocation.
2. Implement actor-session-verified human approval workflow with CSRF,
   resource-specific scopes and audit receipts, and prevent self-approval.
3. Wire the offline-tested AES-GCM vault into a trusted KMS and privileged
   database driver, with reviewed rotation/revocation and no browser keys.
4. Implement transactional outbox claim/retry/heartbeat/lease fencing and
   deduplicated cursor progress under worker identity; perform concurrent tests.
5. Bind runs to ATLAS missions, workspaces and live engine instances in
   server code, enforce owner/admin and separate read/write permissions.
6. Require explicit, reviewed release gating before changing an engine
   instance to connected. None of the existing MAUSBOT primitive execution
   endpoints automatically uses this proposed schema yet.
7. Review security advisors regularly, implement auth session proof, and test the service code in staging before allowing any engine execution.

**Do not mark SHA-132 Done or open the MAUSBOT transport based solely on the applied migration.** This is the durable SQL foundation, not the worker.


## Registry API (M0.7 after migration)

`GET /api/engines/instances?workspaceId=...` lists at most 50 safe
instance metadata rows for a member of that workspace. This is a database
read, **not** a MAUSBOT status or health check.

`POST /api/engines/instances` accepts precisely workspaceId, engineKey,
label and transport. An authenticated owner/admin can register an **offline**
instance only, with created_by taken from the verified auth session. Origin
and JSON checks, the core engine plan validation and database RLS run before
insert. No URL, token, secret key, arbitrary options or status is accepted.
This API neither enables a runtime nor creates a mission or a worker.


## Migration 20261024163943 — outbox key identity

Applied to the connected ATLAS Supabase project after success on the
disposable PostgreSQL 17 CI and checking zero existing outbox records.
The new NOT NULL outbox columns are key_id and version. Both the database
history and GitHub contain exactly the same SQL under:
supabase/migrations/20261024163943_atlas_engine_outbox_envelope_v1.sql.

Follow-up verification: column not-null flags are true, outbox row count
remains zero, and neither anon nor authenticated can select from private
outbox. The versioned SQL is exercised after foundation migration in CI.
No MAUSBOT connection, credential, dispatch or queue insertion occurred.


## SHA-150 — human approvals preconnection

The server-only request/decide/inspect contract is in
\`packages/engine-core/src/approval-workflow.mjs\` and documented at
\`docs/architecture/engine-approvals.md\`. It is intentionally not
exposed to HTTP or Supabase. The existing SQL lacks the immutable
run payload digest and approval intent hash; real authentication,
transactions, migration and Inbox integration remain to be delivered.
