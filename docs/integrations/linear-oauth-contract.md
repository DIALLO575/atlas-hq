# Linear connector — OAuth foundation (SHA-108)

Base reviewed: `c161c7b819ed64d8a57e8b3b7212d2b9be9c57c7` (`main`, 2026-10-24). Linear issue [SHA-108](https://linear.app/shadoron/issue/SHA-108/11-developper-le-connecteur-produit-linear-complet) is currently `Todo` and has no child issues. The repository has a GitHub connector but no Linear package, route, or migration yet.

## First implementation slice

- `packages/connectors/linear/src/contract.ts` records the Linear API endpoints, allowed OAuth scopes, and capability-to-scope mapping. Read access is the default; issue and comment creation use their targeted scopes. Broad `write` and `admin` are excluded, and writes are not enabled in the runtime contract.
- `oauth.mjs` builds a user-actor OAuth authorization URL with PKCE S256, validates HTTPS callback URLs (loopback HTTP only for local development), restricts scopes, and exchanges authorization codes server-to-server using form encoding. It validates the token response and returns only the required token fields; errors are allowlisted and do not include provider response bodies.
- `oauth-state.mjs` signs a 15-minute state bound to one ATLAS workspace and actor, stores only its SHA-256 hash through an atomic-store interface, checks the signed state against the HttpOnly cookie and verified callback actor/workspace, then consumes it once. The production Supabase adapter, secure cookie route, and durable replay-proof store are not part of this slice.
- `graphql-client.mjs` is a minimal no-store GraphQL transport. It does not log, cache, or serialize the bearer token into an application response. Provider errors are mapped to safe categories.
- `workspace-access.mjs` is a fail-closed policy predicate: the authenticated actor must match the queried workspace member, role must be `owner`, `admin`, or `member`, and requested ATLAS workspace must equal the linked workspace. Only owners/admins may manage a connection. Callers must obtain identity and membership from the verified ATLAS server session/database; caller-supplied role values are not authority.

This is not a live integration. There is no OAuth callback/start route, Supabase state-store adapter, encrypted credential store, token refresh/revocation lifecycle, database binding between ATLAS and Linear workspaces, real API request, webhook, or UI status. OAuth app credentials were not created or configured. Tokens must not be persisted until encrypted server-side storage and tenant-scoped RLS/revocation are designed and tested. The client transport is a base for the following read-only API slice, not a general write API.

## Read-only transport correction (2026-10-24)

The initial `graphql-client.mjs` accepted arbitrary GraphQL documents despite `writesEnabled: false`. The isolated follow-up `fix/linear-graphql-readonly` adds a GraphQL-aware lexical scan before transport: it rejects mutations, subscriptions, invalid/ambiguous operation selection, and multi-operation documents without a uniquely matching `operationName`. It ignores comments and string/block-string contents while classifying operations, and includes tests proving rejected documents never call `fetch`. Multiple read operations are allowed only with an explicit operation name. This is a narrow operation-kind guard, not a full GraphQL validator; Linear remains responsible for schema and document validation. The targeted connector test file passes 11/11 locally. No Linear API request or live deployment was made.

## API behavior checked against Linear documentation

- Linear recommends OAuth 2.0 for third-party applications. Its authorization URL is `https://linear.app/oauth/authorize`; send `response_type=code`, callback, scope, and CSRF-protected state. PKCE uses `code_challenge` with `S256`.
- Authorization codes are exchanged by form POST to `https://api.linear.app/oauth/token`; the callback URI must match. PKCE sends the original verifier. Access and refresh tokens are returned; access tokens expire after 24 hours and must not be treated as durable API keys.
- The public API is GraphQL at `https://api.linear.app/graphql`; OAuth bearer credentials are sent in the `Authorization` header.
- Supported narrow scopes documented by Linear include `issues:create` and `comments:create`; `admin` is described as full admin access and should be avoided unless essential. This contract does not request `write` or `admin`.

Sources: [Linear OAuth 2.0 authentication](https://linear.app/developers/oauth-2-0-authentication), [Linear GraphQL getting started](https://linear.app/developers/graphql), [Linear API and webhooks](https://linear.app/docs/api-and-webhooks). Documentation checked 2026-10-24.

## Remaining SHA-108 work

1. **OAuth route and state persistence:** add start/callback server routes. Resolve actor and ATLAS membership from the verified server session/database; require owner/admin to start linking. Set an HttpOnly, Secure, SameSite state cookie and implement the existing atomic state-store contract with a durable Supabase adapter. Test expiry, replay, cookie mismatch, actor mismatch, workspace mismatch, and unauthorized roles.
2. **Credential and tenant binding:** design and implement encrypted server-only access/refresh token storage, tenant-scoped RLS, and the binding from each ATLAS workspace to its Linear workspace. Add refresh, disconnect and revocation handling, plus cross-user/cross-workspace negative tests. Do not store exchanged tokens before this is complete.
3. **Read API:** implement narrow read operations over teams, projects, cycles, issues, statuses, comments, and relations using the guarded transport. Recheck verified membership and the linked workspace on each request; handle pagination, rate limits, and malformed responses. Add tests for authorization failures and provider errors.
4. **Later write capability:** keep writes disabled until explicit preview, approval, idempotency, and audit gates are designed and tested. Surface connection freshness and data provenance in Mes Apps.
5. **Live proof:** only after Linear OAuth credentials and a sandbox workspace are configured, verify a real read and separately approved controlled writes. No live proof is claimed by this slice.
