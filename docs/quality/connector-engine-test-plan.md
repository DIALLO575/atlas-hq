# Connector Engine QA plan

## Scope and execution

This plan applies to the provider-neutral contract and the GitHub-first adapter, with Linear added through the same suite when its adapter exists. Every deterministic test uses Node's test runner, a fake secret resolver, an injected HTTP transport and synthetic fixtures. No live OAuth, API key, webhook secret, customer account or external write is used.

Run locally with Node.js 22 (the CI target) and npm:

```sh
npm ci
npm test
npm run typecheck
npm run lint
npm run build
npm audit
```

The CI workflow runs the same checks for branch pushes, pull requests into `main`, and manual dispatch. A merge candidate passes only when tests, typecheck, lint, build, secret scan and the documented dependency-audit policy all pass. This QA branch is not a production deployment or a request to merge.

## Reusable adapter contract matrix

| Area | Offline contract expected for each adapter | Current status |
| --- | --- | --- |
| Capabilities | Stable operation IDs; valid state and evidence; no `enabled` state with `not_verified` evidence; scope/reason metadata retained | Implemented and tested for GitHub and Linear manifest |
| Authentication | Resolve credentials only through the server secret port with owner and connection scope; disconnected or wrong-provider connections stop before secret resolution or HTTP; credentials never appear in DTOs or errors | Simulated for GitHub; OAuth consent and vault integration unverified |
| Reads | Search and direct read map provider identity, connection ID, URL and source/observation timestamps; pagination cursors remain provider-specific | Search covered; direct read and all pagination edges need expansion |
| Writes | Prepare a canonical preview; bind approval to its hash and connection; enforce scopes; do not call provider before execution; replay returns prior receipt; changed payload conflicts; ambiguous timeout is not retried blindly | Core GitHub paths tested; durable transactional store and live write verification absent |
| Sync and freshness | Resume from a per-connection cursor; persist success/attempt times; calculate lag; report stale/unknown; reconcile deletes and missed events | Adapter has no sync implementation; blocked until sync store/job exists |
| Events and webhooks | Verify signature before processing; reject invalid signatures; deduplicate event ID per connection; record state; reconcile event with a read/sync; reject replay | Ingress/signature/replay code is absent; blocked until an endpoint and durable event store exist |
| Idempotence | Concurrent reservation has one winner; same key/same hash returns one receipt; same key/different hash conflicts; unknown outcomes require reconciliation | Sequential in-memory fake covered; database concurrency and crash recovery require integration tests |
| Provider errors and rate limits | Normalize auth, permission, hidden/missing resource, validation, conflict, rate limit plus retry delay, server failure and timeout without leaking response bodies | Mapping unit tests feasible; response edge cases to expand; real retry behavior unverified |
| Revocation | Revoked credentials stop future operations; provider disconnect clears/revokes the secret reference and invalidates queued work; reconnection is explicit | No revocation lifecycle exists; blocked until connection management and vault operations exist |
| Account separation | Every lookup, cursor, idempotency key, relation and event is keyed by owner + connection; another account cannot reuse a command or resource | Command binding and resolver scope are unit-testable; cross-tenant database/RLS isolation needs a provisioned backend |
| API regressions | Normalized fixtures pin provider identity and expected request/response shape; run against supported API fixtures before adapter releases | Synthetic GitHub fixture added; recorded API fixtures and provider sandbox are still needed |

## ATLAS Agent Layer: PR → @VISION contract

The first end-to-end slice is a GitHub pull request as the source resource, @VISION as the selected agent, an authorized bounded context package, and a real OpenMausBot mission whose final result links back to that same PR. The UI response or a locally generated summary is not evidence of a mission dispatch.

The synthetic fixture and Node tests in `tests/fixtures/agent-layer/pr-vision-mission.json` and `tests/agent-layer-contract.test.mjs` pin the initial request/event contract. Run them with `npm test`. The context allowlist is limited to PR title/body, base/head refs and SHA, changed file names and patches. Tenant/workspace identifiers are part of authorization scope; unrelated resources, credentials and unrestricted repository contents must not enter the context. The PR URL, number and source SHA must stay consistent through dispatch, status events and the final result.

| Contract | Required behavior | Offline coverage now | Real integration gate |
| --- | --- | --- | --- |
| Selection/context | Resolve @VISION to its stable agent ID; transmit only the selected PR and policy-authorized fields; reject cross-workspace resources and secret-like values | Fixture checks exact context keys, source identity, and rejects additional unrelated context/secret-like content | Verify actual permission filtering and serialized mission payload from the PR surface |
| Dispatch/idempotency | One user action creates one mission; retries with the same request key and payload return the same mission; changed payload with the same key conflicts | Request key and identity are pinned in the synthetic fixture; a live deduplication assertion is not possible without the dispatch service | Repeat the same dispatch; verify one OpenMausBot mission ID and conflict on changed context |
| Lifecycle/errors | Expose queued/running/succeeded/failed/retryable; normalized error code; unknown outcomes are reconciled before retry | Event contract rejects unknown states, missing error codes, and success linked to a different PR | Force auth, permission, unavailable, timeout and retry cases; confirm no duplicate mission |
| Result/audit | Persist requester, workspace, agent, source PR/SHA, mission ID, timestamps, outcome and result URL; attach the result to the exact originating PR | Synthetic status event checks source identity and same-PR binding | Inspect OpenMausBot mission record and GitHub resource relation/audit entry after completion |
| Isolation/mobile | Enforce workspace and account boundary at lookup and write time; make selection, confirmation, progress, retry and result reachable on mobile | Cross-resource fixture rejection only; mobile UI and database policy are not in this test harness | Test two isolated workspaces and a narrow mobile viewport with the actual app |

### Current execution status and blocker

Repository inspection on 2026-10-22 found the foundation PR and the Connector Engine QA branch, but no J.A.R.V.I.S./SHURI/Agent Layer implementation branch. The available OpenMausBot tool surface in this QA run exposes teammate coordination but no mission-dispatch/create/read operation. Therefore these tests are contract checks over synthetic input, not a simulated claim that a real mission ran. A real PR → @VISION execution remains blocked until the Agent Layer dispatch/status integration is available and an authorized test PR can be used. Record the mission ID, exact source PR/SHA, audit record and final linked result when that environment is ready.

### Pass criteria for the first live slice

- `npm test`, typecheck, lint, build, secret scan and the dependency audit policy pass on the QA branch.
- A single real dispatch yields a real OpenMausBot mission ID; replay does not create another mission.
- The mission carries only the allowlisted, permission-filtered context for the identified PR/SHA.
- Status, normalized failures/retry behavior and final result remain attached to that same PR.
- Cross-workspace access is denied and recorded; mobile selection and result flow work at a narrow viewport.
- Any unavailable live gate stays marked unverified; no capability is marked live-verified from fixture tests.

## Test layers and gate criteria

1. **Unit/contract (every PR):** fake transport and fake vault only. Assert identity, error codes, secret isolation, previews, cursor semantics, freshness arithmetic, idempotency and account scoping. No external network calls.
2. **Persistence integration (before enabling writes):** disposable database, migrations and RLS enabled. Test concurrent idempotency reservations, owner/connection boundary, checkpoint/event uniqueness, rollback and secret-reference revocation. Never store provider tokens in fixtures or logs.
3. **Provider sandbox (before a connector is called verified):** dedicated test organization/repository and Linear test team; least-privilege test credentials supplied through the secure vault path. Verify OAuth consent, read, approved write, post-write readback, rate-limit response, revoked token, webhook signature/replay and cleanup. Capture sanitized request metadata only.
4. **Regression/release:** compare saved sanitized provider fixtures and contract results against the adapter's pinned capability matrix. Any provider schema change, missing permission, duplicate write, stale cursor or account-boundary leak is a release blocker.

Pass criteria: required CI checks green; no unexpected high/critical audit findings; no secret-scanner findings; all active contract assertions green; and every capability shown as enabled has live authorization evidence for the exact connection. A skipped or unavailable layer is reported as unverified and cannot promote a capability to enabled.

## Current dependency findings

On 2026-10-22, `npm ci` installed the committed lockfile and reported five high-severity audit entries. All five are development-only and form one dependency path: `eslint-config-next@16.4.2` → `@next/eslint-plugin-next@16.4.2` → `fast-glob@3.3.1` → `micromatch@4.0.8` → `braces@3.0.3`. npm traces the four upstream package entries to the same `braces` advisory, GHSA-vfj7-8cjw-p6xm (CVSS 7.5, affected range `<=3.0.3`); the direct `eslint-config-next` entry is the aggregate path. `npm audit --omit=dev` reports zero vulnerabilities. `npm audit` offers `eslint-config-next@14.2.35` as a fix, which is a major downgrade from the pinned 16.4.2 and is not an acceptable blind fix. The registry did not have `braces@3.0.4` when checked. Keep this exception limited to that advisory and dependency path; recheck the audit before each release and remove the exception as soon as an in-range upstream patch is available.

## Not yet verifiable without environment access

- GitHub App/OAuth and Linear OAuth/API-key authorization, effective scopes and workspace/team selection.
- Real provider read/write and after-write readback in dedicated test accounts.
- Provider-side rate-limit timing, webhook signatures and replay behavior.
- Durable database isolation, RLS, unique idempotency constraints, crash recovery and revocation.
- Sync scheduling, cursor persistence, freshness lag and missed-event reconciliation.

Required before those checks: disposable GitHub repository and Linear team; configured OAuth applications; server-side vault reference; non-production webhook endpoints; and an isolated database with the intended RLS policies. Credentials must be entered through the secure credential path and must not be copied into repository files, chat, logs or test fixtures.

## Rollback

For this QA-only change, revert the commit or delete `qa/connector-engine-contract-harness`; no data or external provider state is changed by the tests. If a future integration test creates a sandbox issue, delete only the fixture issue identified by its recorded test marker and verify it is absent. Do not replay a write whose outcome is unknown; reconcile by reading the provider first. No production deployment is in scope.
