# Notion async task status runner (SHA-141)

`src/lib/notion/async-task-runner.ts` contains a one-claim server runner. It is
not exposed as a route and no schedule or worker host invokes it. Execution
requires both `NOTION_ASYNC_TASK_WORKER_ENABLED=true` and
`NOTION_DISTRIBUTED_BUDGET_ENABLED=true`; both remain off by default.

The runner uses the existing SQL claim/finish RPCs (lease IDs fence completion)
and rechecks the actor, workspace, Notion workspace, connected registry,
membership, revocation and exact credential version before decrypting. It also
rechecks the exact lease after budget admission and before the HTTP request. Refresh
in progress, missing/ambiguous records and unavailable stores stop processing.
The provider client can only issue the fixed GET
`https://api.notion.com/v1/async_tasks/{task_id}`; its request has a 7 second
client timeout and a 9 second abort signal. Distributed admission and circuit
state are mandatory. There are no automatic request retries. Task response
objects, provider errors, content and tokens are reduced to fixed outcome/error
codes before persistence; unknown outcomes become `invalid_response`.

`onMetric` receives only one of seven fixed event names; callers must aggregate
these as counters without adding job, actor, workspace or provider dimensions.
No durable audit sink or metrics backend is wired yet. SQL async-queue and
distributed-budget contract scripts exist, but this change does not apply or
run migrations against Supabase. The 9 second signal and database lease fencing
bound stale work; if the request or finish store is ambiguous, the runner does
not claim success (the lease can expire and be reclaimed). Scheduler hosting,
operational dashboards/alerts, and end-to-end PostgreSQL verification remain
future work. No production flag is enabled by this source change.
