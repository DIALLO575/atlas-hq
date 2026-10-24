# SHA-141 — Distributed REST admission (second slice, 24 Oct 2026)

## Status and activation

This migration is **source-only**: no SQL from this PR has been applied to the official ATLAS Supabase project. The distributed limiter is opt-in with the **server-side** environment variable:

    NOTION_DISTRIBUTED_BUDGET_ENABLED=true

**Do not set this flag before the SQL migration exists, the live OAuth sandbox tests pass, and a deployment review authorizes activation.** When enabled but unavailable, the limiter **fails closed** and does not send an unbudgeted provider request. With the flag OFF (default), the previous conservative process-local limiter is still used. The feature flag is not exposed to the browser.

## Durable contract

Migration: \`supabase/migrations/20261024161500_atlas_notion_rest_distributed_gate.sql\`.

- RLS enabled, no browser permissions and no browser-callable RPC: only \`service_role\` may reserve a slot or report a rate limit.
- Admission validates the **current** ATLAS admin member, provider registry status, exact personal Notion vault binding, active credential version and absence of an in-flight refresh. A credential being rotated or revoked cannot reserve a new read.
- The transaction locks the credential and workspace/connection budget rows. Slot spacing is 350ms per connection and per Notion workspace **across all Node workers sharing the same database**. A slot is a time reservation, not a transaction or lock held while calling Notion.
- The reservation returns nonnegative wait milliseconds; a negative integer indicates deferred seconds; NULL means no valid active binding. The caller does not wait more than 3s in one Node worker.
- Notion 429/529 cooldown is also stored at both scopes (workspace first, connection second), with a strict 0–3600 second bound. An RPC outage prevents an optimistic retry.
- Safe operational counters (reservation, deferred, throttled) are stored; **no OAuth tokens, payload, page titles, content, search terms or per-request activity log**. They are provisional counters, not yet a complete telemetry pipeline.

## Scope and remaining work

This slice is a **distributed admission gate, not a durable work queue or end-to-end resilience guarantee**. If the request is cancelled after reserving, the slot is wasted conservatively; provider requests already in flight cannot be retroactively cancelled by a local revoke. Multiple independent services not using the same Supabase budget are not globally coordinated. Quotas may vary by Notion workspace plan.

The next SHA-141 slice remains: durable async work scheduling, dead-letter, circuit breaker, bounded metrics export and alerting shared with SHA-109. Future mutating endpoints require explicit idempotency/approvals and a separate retry policy.

After a successful OAuth 401 refresh, the REST reader must create a budget binding with the **new** token version, never reuse the stale bound version.

## Tests

- \`tests/sql/notion-rest-distributed-budget.sql\` verifies role grants/RLS, actor/workspace/version rejection, slot spacing, shared cooldown, long delay deferral, refresh gate and revoke denial.
- \`tests/sql/notion-rest-budget-concurrency.sh\` performs two independent PostgreSQL-session admissions for the same workspace/connection and asserts no lost reservations.
- \`distributed-budget.test.mjs\` and the REST regression tests cover fail-closed DB outages, aborts, cooldown propagation and no provider request following denied admission.
- Existing PostgreSQL migrations and CI remain source-only and isolated.

Sources: https://developers.notion.com/reference/request-limits ; https://supabase.com/docs/guides/database/postgres/row-level-security
