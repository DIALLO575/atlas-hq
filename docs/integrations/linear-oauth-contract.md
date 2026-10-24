# Linear connector — OAuth foundation (SHA-108)

Base reviewed: `c161c7b819ed64d8a57e8b3b7212d2b9be9c57c7` (`main`, 2026-10-24). Linear issue [SHA-108](https://linear.app/shadoron/issue/SHA-108/11-developper-le-connecteur-produit-linear-complet) is currently `Todo` and has no child issues. The repository has a GitHub connector but no Linear package, route, or migration yet.

## First implementation slice

- `packages/connectors/linear/src/contract.ts` records the Linear API endpoints, allowed OAuth scopes, and capability-to-scope mapping. Read access is the default; issue and comment creation use their targeted scopes. Broad `write` and `admin` are excluded, and writes are not enabled in the runtime contract.
- `oauth.mjs` builds a user-actor OAuth authorization URL with PKCE S256, validates HTTPS callback URLs (loopback HTTP only for local development), restricts scopes, and exchanges authorization codes server-to-server using form encoding. It validates the token response and returns only the required token fields; errors are allowlisted and do not include provider response bodies.
- `oauth-state.mjs` signs a 15-minute state bound to one ATLAS workspace and actor, stores only its SHA-256 hash through an atomic-store interface, checks the signed state against the HttpOnly cookie and verified callback actor/workspace, then consumes it once. The production Supabase adapter, secure cookie route, and durable replay-proof store are not part of this slice.
- `graphql-client.mjs` is a minimal no-store GraphQL transport. It does not log, cache, or serialize the bearer token into an application response. Provider errors are mapped to safe categories.
- `workspace-access.mjs` is a fail-closed policy predicate: the authenticated actor must match the queried workspace member, role must be `owner`, `admin`, or `member`, and requested ATLAS workspace must equal the linked workspace. Only owners/admins may manage a connection. Callers must obtain identity and membership from the verified ATLAS server session/database; caller-supplied role values are not authority.

This is not a live integration. There is no OAuth callback/start route, Supabase state-store adapter, encrypted credential store, token refresh/revocation lifecycle, database binding between ATLAS and Linear workspaces, real API request, webhook, or UI status. OAuth app credentials were not created or configured. Tokens must not be persisted until encrypted server-side storage and tenant-scoped RLS/revocation are designed and tested. The client transport is a base for the following read-only API slice, not a general write API.

## API behavior checked against Linear documentation

- Linear recommends OAuth 2.0 for third-party applications. Its authorization URL is `https://linear.app/oauth/authorize`; send `response_type=code`, callback, scope, and CSRF-protected state. PKCE uses `code_challenge` with `S256`.
- Authorization codes are exchanged by form POST to `https://api.linear.app/oauth/token`; the callback URI must match. PKCE sends the original verifier. Access and refresh tokens are returned; access tokens expire after 24 hours and must not be treated as durable API keys.
- The public API is GraphQL at `https://api.linear.app/graphql`; OAuth bearer credentials are sent in the `Authorization` header.
- Supported narrow scopes documented by Linear include `issues:create` and `comments:create`; `admin` is described as full admin access and should be avoided unless essential. This contract does not request `write` or `admin`.

Sources: [Linear OAuth 2.0 authentication](https://linear.app/developers/oauth-2-0-authentication), [Linear GraphQL getting started](https://linear.app/developers/graphql), [Linear API and webhooks](https://linear.app/docs/api-and-webhooks). Documentation checked 2026-10-24.

## Remaining SHA-108 work

1. Add server routes and a durable Supabase state-store adapter for the signed, expiring, one-time state bound to authenticated actor and ATLAS workspace; only workspace owners/admins can initiate linking.
2. Add encrypted server-only access/refresh token storage with RLS and per-workspace Linear workspace binding; implement refresh, disconnect, revocation, and cross-workspace negative tests.
3. Add a read-only GraphQL reader for teams, projects, cycles, issues, statuses, comments, and relations; apply membership and linked workspace authorization on every request, with pagination/rate-limit behavior.
4. Add explicit preview/approval/idempotency/audit gates before any write capability, and surface freshness/provenance in Mes Apps.
5. Prove real reads and controlled sandbox writes only after a Linear test workspace and OAuth application are available. No live proof is claimed by this slice.
