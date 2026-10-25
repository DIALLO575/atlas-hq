# SHA-151 — Outbox leases and fencing (preconnection)

Status: PR41 SQL foundation is merged/applied. This development tranche adds
an application-level **simulation runner**, private SQL adapter and independent
process tests. It is not an installed production worker. No MAUSBOT network I/O,
credential/payload decrypt, session-based approval queueing or deployment is added.
KMS is deferred by explicit Founder instruction; the simple server credential
proposal is PR49. A network token is distinct from encrypted outbox payloads.

## Private worker foundation

The applied migration `supabase/migrations/20261024205621_atlas_engine_outbox_fencing_v1.sql`
extends `private.atlas_engine_outbox` with:

- `lease_token` (unguessable UUID), `lease_epoch` (monotonically increasing
  fencing generation), `lease_owner` (validated label), `lease_until`
  (existing), `next_attempt_at`, `last_error_code` (safe code, not raw
  exception text), `attempt_count` (existing).
- DB check: leased rows must carry a token, generation, owner, lease expiry;
  non-leased rows carry no active lease metadata.
- A due-item partial index supports tenant-limited lookups.
- A migration blocker prevents altering a DB with **active leased rows**.

Four private, `SECURITY INVOKER`, `service_role`-only functions:

1. `atlas_engine_worker_claim` reserves a due row with
   `FOR UPDATE OF o SKIP LOCKED` to avoid claiming the same row twice,
   checks a **connected instance, authorized run, approved unexpired
   human decision**, caps attempts at five and returns metadata plus a
   new token/epoch. It never returns plaintext or encrypted payload.
2. `atlas_engine_worker_heartbeat` extends an **unexpired matching**
   lease only if the token, owner, epoch, workspace and approval policy
   all still match.
3. `atlas_engine_worker_finish` requires the same matching token/epoch.
   It stores `delivered`, `retry` or `dead-letter`, with bounded
   backoff and a sanitized error code. Stale workers must fail.
4. `atlas_engine_worker_reap_exhausted` closes the expired lease when
   all five attempts were used and a worker crashed, keeping an audit
   record and preventing permanently stranded leases.

All updates insert privacy-safe audit events in the same transaction.
If audit fails, the transition must roll back. These functions are not
granted to `anon` or `authenticated` and are not placed in a
PostgREST-exposed schema.

## CI scope

`tests/sql/engine-outbox-fencing-checks.sql` uses **a disposable
PostgreSQL 17 test database** and fixture-only simulated engine states.
It exercises offline blocking, two mock workers, no duplicate claim,
valid and invalid heartbeat, stale token after simulated crash,
epoch increment on reacquisition, bounded retry/backoff, dead-letter
after fifth failure, audit and isolation of private payloads. No
network API or MAUSBOT process is ever started.

Those existing SQL checks are sequential. The new
`tests/engine-worker-processes.mjs` exercises the application runner on separate
Node processes/connections: one uncommitted claim is held while the other process
must return idle through SKIP LOCKED; SIGKILL before/after a simulated effect;
expired lease recovery; stale process resumption; instance revocation after claim;
fifth-attempt failure and idempotent crash reaping. CI runs it on disposable PG17.
This is simulation evidence only, not real provider idempotence or Auth E2E.

## Before SHA-151 Done

- The versioned migration is applied after green CI, security advisors,
  and preflight confirming **no leased records**. Live verification shows
  5 columns, 4 private SECURITY INVOKER functions, role-limited EXECUTE,
  zero engines, zero runs and zero outbox records.
- Build trusted server-side worker with narrowly scoped DB identity.
  Service-role access must never be exposed to HTTP/browser; prefer a
  dedicated role/least-privilege internal adapter during review.
- KMS is deferred. Review the simple server-token scope (PR49) separately from
  payload decryption/storage. This simulation reads neither credentials nor
  ciphertext/plaintext payloads; it must not be presented as an outbox decryptor.
  Secrets must stay out of logs, metrics, browser APIs and plaintext SQL.
- Enforce capability-specific human approval and immutable run intent
  again at send time, **after** lease and before network dispatch.
- Add distributed integration tests with **two database sessions**,
  real worker crash/restart, revoked approval, retry/dead-letter,
  idempotency across external side effects and durable SSE receipts.
- Obtain SHA-133 review and GO/NO-GO for a sandbox engine.
  The MAUSBOT `write/execute` hard gate (HTTP 423) remains unchanged.


## Simulation runner and private SQL adapter

`packages/engine-core/src/outbox-worker.mjs` exports a parameterized query adapter
around the four existing SQL functions and one-step `runEngineSimulationOnce`.
The application adapter returns only lease metadata, never outbox payloads.
The supplied query executor must be server-only and enforce DB connection/query
timeouts; SQL transitions and audit remain in the existing atomic functions.
No DB URL, token or SQL role is provisioned by this code.

Only a transport created by `createEngineSimulationTransport` is accepted.
It has no URL, credential, payload or HTTP/fetch option. Its trusted injected
receipt store must atomically deduplicate `(workspace, instance, outboxId)`.
The stable simulation operation key is the outbox UUID, independent of lease
owner/epoch. This key is internal simulation protocol; no claim is made that
MAUSBOT supports it. The receipt callback is trusted server/test code, not user input.

The runner requires `private.atlas_engine_disposable_worker_fixture` and a
one-column fake `auth.users` schema before claiming anything. The process harness
also requires `ATLAS_ENGINE_DISPOSABLE_TEST=1` and a localhost PGHOST before any
fixture writes. This marker table exists only in disposable tests and is not a
migration to apply on Supabase. Simulation does not activate an offline instance;
only test fixtures deliberately fabricate a connected instance/authorized run.

A simulated effect is capped at five seconds (less than the minimum lease).
Heartbeats revalidate SQL conditions before and after it. A missing lease stops
finalization. A failed/uncertain receipt or finalization leaves `recovery-required`
for lease expiry and fenced retry, without leaking raw error messages. Explicit
retryable simulation failures use the existing bounded SQL backoff/dead-letter.
Cancellation stops new work; an already-completed effect cannot be undone.

The integration receipt ledger is a **fake provider**, deliberately stored in the
same disposable PostgreSQL for reproducibility. A crash after recording an effect
and before finishing the outbox is recovered with the same key and one receipt.
This demonstrates handling of the uncertain interval for an idempotent provider;
it is not an exactly-once guarantee for MAUSBOT or arbitrary network side effects.

Still absent: production loop/scheduler, least-privilege DB identity provisioning,
real credential/payload resolution, full session/role/mission/tool revalidation,
network timeout reconciliation, durable SSE/webhook receipt handling and deployment.
The simulation must never be modified into a real worker by merely removing a flag.
