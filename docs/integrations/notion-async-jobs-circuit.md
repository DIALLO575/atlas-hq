# SHA-141 — Notion durable async-task tracking and circuit breaker

## Scope (source only, not deployed)

This slice builds on PR #35. The following migrations are **NOT applied** to official ATLAS Supabase and no poller runs by default:

- `20261024163000_atlas_notion_async_jobs.sql`: queue for **Notion async_task status GET only**.
- `20261024163500_atlas_notion_rest_circuit_breaker.sql`: shared per-workspace transient-response circuit.
- `20261024165000_atlas_notion_async_retention.sql`: bounded cleanup of terminal async metadata.

**No write queue, no replay of create/update page calls, no access token or page content in the queue.** The persisted queue stores only task IDs, ATLAS/Notion actor and connection scope, credential version, attempts, lease token/time, sanitized error category and timestamps. Provider task result is deliberately discarded.

## Durable async tracking

- Enqueue RPC verifies a personal, active, owner/admin connection with exact vault version. Task ID is strictly `task_*`; duplicate enqueue is idempotent within the token version.
- Claim RPC uses `FOR UPDATE SKIP LOCKED`, 30–120 second leases (90 recommended), lease-token CAS on finish and at most eight GET polls by default. Expired leases are reclaimed; exhausted leases become dead letters.
- Finish RPC marks succeeded, poll_again, transient or permanent, with bounded retry delay and only sanctioned error codes. Wrong/expired leases are rejected.
- Any OAuth token rotation or connection revocation **deletes queued task pointers** for that connection.
- Terminal metadata can be purged in batches of 1–1000 after 1–90 days through a service-role-only RPC. The source does not schedule that RPC, and it never selects queued or leased work.
- `async-task-worker.mjs` is a pure dependency-injected one-job pump, not a deployed or scheduled worker. A production runner will require secret-protected scheduling, current credentials, vault, revalidation and distributed admission for each GET.

## Shared circuit breaker

- The distributed budget reports successful or transient REST provider outcomes through a service-role-only SQL RPC.
- Three consecutive 5xx/529 failures open a conservative 30-second **workspace** cooldown automatically honored by the existing admission RPC. Success resets failures.
- This is a timed-open breaker, **not** a fully adaptive half-open one-probe breaker. No automatic notifications yet.

## Validation / release gates

- Disposable PG17 CI: migration grants, RLS, wrong actor/version, duplicates, lease fencing, retry/dead-letter, refresh and revoke purge, circuit failures, two independent PostgreSQL sessions claiming different jobs.
- Node: task status mapping, no provider content persisted, cooldown and circuit failure handling, no retries if the distributed store is down.
- The two migrations are **source-only**. No Supabase Production migration, Vercel rollout, OAuth live test or `main` merge. SHA-134 remains the required sandbox proof; SHA-109 coordinates the durable job infrastructure.

Official docs: https://developers.notion.com/reference/retrieve-async-task ; https://developers.notion.com/reference/request-limits
