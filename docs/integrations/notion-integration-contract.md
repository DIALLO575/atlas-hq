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

## Tenant-safe OAuth implementation (SHA-120 / SHA-122; draft)
- Migration 20261024140000_atlas_notion_connection_foundation.sql revokes browser writes to trusted registry/index/cursors, adds workspace membership bindings, and creates server-only OAuth-state + encrypted credential tables.
- Migration 20261024140500_atlas_notion_atomic_store.sql provides one service-role-only transactional RPC to persist the registry row and ciphertext after authorization. DO NOT apply official Supabase migrations without a separate production approval.
- AES-256-GCM AAD binds workspace ATLAS, actor, Notion workspace/bot and token kind. Envelopes carry versioned key IDs; refresh token may be null per current Notion API schema. Durable refresh/revocation is still to do.
- OAuth state is signed random 15-minute value, SameSite=Lax HttpOnly cookie, SHA-256 hash-only DB record and one conditional UPDATE to prevent replay. Callback rechecks current session and admin membership.
- Routes /api/apps/notion/connect/start and /api/apps/notion/oauth/callback, and /apps/notion, are gated by NOTION_OAUTH_CALLBACK_ENABLED=true, valid server settings and encrypted keyring.
- Start verifies Origin and actor membership. Callback exchanges code server-side, verifies bot identity and calls the server-only RPC. No frontend exposure of access or refresh tokens.
- Notion API permissions still require each resource to be shared. Authorization is not proof of access to every Notion page.
- The UI must report non-configured state honestly. No Notion secrets or provider live OAuth proof exist yet; no production migration or deployment was performed.
- Required server-only env: ATLAS_PUBLIC_ORIGIN, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, NOTION_OAUTH_CLIENT_ID, NOTION_OAUTH_CLIENT_SECRET, NOTION_OAUTH_REDIRECT_URI, NOTION_OAUTH_STATE_KEY (>=32 bytes), NOTION_OAUTH_TOKEN_KEY_ID, NOTION_OAUTH_TOKEN_KEYS (JSON keyring), NOTION_OAUTH_CALLBACK_ENABLED.
