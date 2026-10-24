# SHA-141 — Notion REST reliability (read-only first slice)

**State:** source branch/PR only; no official Supabase/Vercel/Notion OAuth changes.

## Provider contract and implementation

Official documentation:
- https://developers.notion.com/reference/request-limits
- https://developers.notion.com/reference/status-codes
- https://developers.notion.com/reference/retrieve-async-task

- Notion rate limit: 3 requests/second on average per connection, plus workspace-wide limit depending on plan. A process-local gate conservatively spaces requests at least 350 ms apart per workspace and per connection using only server-derived UUID keys.
- On 429 or 529, set connection/workspace cooldown honoring integer Retry-After up to 3600 seconds. If a request would wait >3 seconds in the gate, return a bounded error with retry information; don't occupy a serverless worker for minutes.
- At most two automatic retries, with exponential fallback delay 1s/2s plus jitter <=200ms and per-delay ceiling 2500ms. An excessive Retry-After is not auto-slept: pass the 429 or 529 back and retain the in-memory cooldown.
- 429/529 are retried only for the read-only endpoints owned by this client. 500/502/503/504 retries are GET-only; read-only POST /v1/search is never retried after ambiguous 5xx. Never auto retry 401,403,404, network exceptions, malformed JSON, aborted requests or future writes.
- Hard timeout and AbortSignal per physical HTTP attempt, fixed provider origin, no raw response body or credentials in errors. Explicit PROVIDER_OVERLOADED mapping for 529.
- GET /v1/async_tasks/{task_id} is supported with a strict task ID grammar and no background polling.
- Personal connection reads use an injected scheduler bound to Notion workspace and ATLAS connection; even the read following OAuth refresh uses this gate.

## Known limits and remaining SHA-141 work

**No distributed queue, shared global rate limit, persistent circuit breaker, dead-letter queue or metrics yet.** Different Vercel workers have independent memory and external Notion clients consume shared rate quota. The local process budget is bounded (512 keys per partition, 32 pending slots and 3 seconds maximum queue wait) to avoid unlimited memory or hung requests.

Next slice: distributed scheduler with bounded durability across workers under SHA-109, selective backoff for sync jobs, safe write idempotency, circuit breaker, observability (no tokens or private page data), and optional durable async task polling. This PR cannot claim a live Notion test; SHA-134 remains the sandbox validation milestone.

## Validation contract

Unit tests: per-workspace multi-connection contention, cooldown, bounded queue, abort, Retry-After, 429/529, GET-only 5xx, POST ambiguity no replay, 401/403 no replay, secret-safe errors, task input validation. CI: npm test/typecheck/lint/build and disposable Notion/Linear PostgreSQL regressions.
