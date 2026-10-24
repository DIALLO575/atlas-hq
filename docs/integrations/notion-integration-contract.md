# ATLAS × Notion — implementation contract (SHA-111 / SHA-121)

Status (2026-10-24): **read-only adapter and OAuth protocol primitives, NOT a connected product**.
No real Notion credential, OAuth authorization, Supabase migration or production deployment was performed for this slice.

## Baseline
- Repository main base commit: a436d6d4def9fcb26bd4151ca7413715294154ec.
- Supabase ATLAS official project has generic empty tables atlas_connections / atlas_provider_objects / atlas_sync_cursors. Do not create duplicate tables.
- Existing atlas_connections.status, capabilities, granted_scopes and secret_ref are currently client-editable by its owner and MUST NOT be trusted as authorization grants; SHA-120 covers hardening before exposing new actions.
- GitHub uses verified installation scopes, Linear uses per-actor encrypted secrets and one-time OAuth state. Reuse the patterns, not their provider credentials.

## First slice: SHA-121
- packages/connectors/notion/src/rest-client.mjs: server-only fixed-origin HTTP adapter for read-only endpoints. The search API is *search by title*, not full text.
- packages/connectors/notion/src/oauth.mjs: protocol building blocks only. Never call token exchange from a browser and NEVER send returned tokens to the browser. Implement server-side state persistence with single consumption, identity binding and encryption before enabling a route.
- packages/connectors/notion/src/capabilities.mjs: code capability catalog, not verified user authorization.
- Node test suite in packages/connectors/notion/test/*.test.mjs.
- No write endpoints, no webhook subscriptions, no MCP auth in this first slice.

## Security gates
1. Verify ATLAS Supabase session with auth.getUser() on each authenticated route.
2. Bind connection to exact ATLAS workspace + user and Notion workspace, verifying memberships on every read.
3. Enforce provider permissions using server-stored encrypted credentials and the actual provider responses; **never** use client-editable atlas_connections.capabilities as proof.
4. Use constant Notion API origin, Notion-Version 2026-03-11; no arbitrary URL, no arbitrary HTTP verb.
5. Keep token material encrypted and inaccessible to anon/authenticated Data API roles. Do not log request body or bearer credentials.
6. OAuth state must be per-attempt, CSRF-safe, durable and single-use. Exchange code server-side only; implement refresh/revoke with concurrency safe semantics before connecting users.
7. Enforce pagination bounds, 429 Retry-After, no unbounded crawling or blind retries of write actions.
8. Separate Notion REST OAuth credentials from MCP OAuth credentials; MCP is not enabled in this batch.
9. For Notion webhooks, verify raw body signatures, replay protection and retrieve latest state through REST (SHA-124, after connection).
10. New SQL must be tested on a disposable DB with multi-tenant RLS regression; do not apply to official Supabase without explicit approval.

## Test and delivery
Use npm test (Node built-in test runner), npm run typecheck, npm run lint, npm run build. Verify CI for the PR commit. Avoid preview proliferation per AGENTS.md; do not merge/deploy to production without separate approval.

Official docs:
- https://developers.notion.com/reference/intro
- https://developers.notion.com/guides/get-started/authorization
- https://developers.notion.com/reference/post-search
