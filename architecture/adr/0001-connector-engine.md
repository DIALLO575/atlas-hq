# ADR 0001 — ATLAS Connector Engine

- Status: accepted for the first implementation slice
- Date: 2026-10-22
- Branch: `feat/atlas-connector-engine`
- Builds on: `feat/atlas-hq-six-tabs`

## Decision

Use a provider-independent connector contract, with provider adapters on the server. A connection is scoped to one owner, provider account/workspace and secret reference. Secrets are resolved only by a server-side vault port; connection DTOs and normalized resources contain no credential material. Capabilities carry a state and evidence so an unverified action is never shown as enabled.

Reads return provider identity, canonical URL and observed/source timestamps. Writes are prepared as typed previews, require approval bound to the preview hash, enforce granted scopes and use a durable idempotency-store port. An uncertain network result is persisted as unknown and cannot be blindly reissued. Webhook events and sync cursors must be unique per connection and feed a reconciliation sync; provider links and resource identity always include the connection ID. Audit records should retain actor, action, target, preview hash, approval, provider receipt and verification state without storing tokens or raw provider payloads by default.

GitHub is the first executable adapter slice: REST issue search/read/create with injected server-side secret resolution and fetch. Linear is represented by an explicit unknown-capability manifest until OAuth/API-key consent, team access, scopes and server-side credential persistence are verified. No real provider credentials or mutations are used in tests.

## Consequences and boundaries

- The current repository has a frontend and contract tests but no backend session, encrypted secret store, durable jobs, audit persistence or webhook ingress. The adapters are ports and a first vertical slice, not production-ready connection management.
- `IdempotencyStore` must be backed by a durable unique key and transactional state transitions before enabling writes. A network timeout is `unknown_outcome`; reconcile against GitHub by the persisted command and source before any retry.
- GitHub search/read requires repository issue read permission; issue creation requires issue write permission. The live ATLAS HQ OAuth/App installation and its effective scopes are not configured or verified here.
- Linear needs a Linear OAuth client or explicitly selected API key consent and an authorized team. Do not place either secret in frontend configuration.
- Webhook signatures, replay protection, durable cursor persistence, deletion/revocation and production encryption remain follow-up work. No webhook or production capability is declared enabled in this slice.

## Verification

Tests use an injected fetcher, fake secret resolver and in-memory idempotency store. They cover normalization, preview/approval binding, permission and auth blockers, duplicate suppression, unknown outcomes and the unverified Linear manifest. End-to-end external verification requires user-authorized GitHub OAuth/App consent and a designated sandbox repository; Linear additionally requires authorized team access.
