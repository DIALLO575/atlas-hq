# SHA-151 — Outbox leases and fencing (preconnection)

Status 2026-10-24: **SQL functions and PostgreSQL disposable tests only.**
No real worker, no MAUSBOT network I/O, no credential/KMS decrypt, no
session-based approval queueing, no application deployment.

## Private worker foundation

The additive SQL proposal `supabase/proposals/engine-outbox-fencing-v1.sql`
extends `private.atlas_engine_outbox` with:

- `lease_token` (unguessable UUID), `lease_epoch` (monotonically increasing
  fencing generation), `lease_owner` (validated label), `lease_until`
  (existing), `next_attempt_at`, `last_error_code` (safe code, not raw
  exception text), `attempt_count` (existing).
- DB check: leased rows must carry a token, generation, owner, lease expiry;
  non-leased rows carry no active lease metadata.
- A due-item partial index supports tenant-limited lookups.
- A migration blocker prevents altering a DB with **active leased rows**.

Three private, `SECURITY INVOKER`, `service_role`-only functions:

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

These sequential tests do **not** yet prove two truly concurrent
PostgreSQL connections. Separate process-level concurrency/crash/replay
tests are a remaining release requirement.

## Before SHA-151 Done

- Apply an approved versioned migration after CI, advisors and
  preflight confirm **no leased records**. Production database currently
  has no engines or work items.
- Build trusted server-side worker with narrowly scoped DB identity.
  Service-role access must never be exposed to HTTP/browser; prefer a
  dedicated role/least-privilege internal adapter during review.
- Integrate SHA-149 KMS so only a worker with verified entitlement can
  decrypt one payload; no plaintext in logs, metrics, API or audit.
- Enforce capability-specific human approval and immutable run intent
  again at send time, **after** lease and before network dispatch.
- Add distributed integration tests with **two database sessions**,
  real worker crash/restart, revoked approval, retry/dead-letter,
  idempotency across external side effects and durable SSE receipts.
- Obtain SHA-133 review and GO/NO-GO for a sandbox engine.
  The MAUSBOT `write/execute` hard gate (HTTP 423) remains unchanged.
