# ATLAS HQ monorepo layout

## Target

```text
apps/web/                         Next.js Web/PWA
packages/shared-types/            shared domain and API contracts (when reused)
packages/connector-core/          connector interfaces, auth and capability primitives
packages/connectors/github/       GitHub implementation
packages/connectors/linear/       Linear implementation
packages/connectors/notion/       Notion implementation (later)
```

The repository is currently a single Next.js application at its root. Keep that
working layout for this backend change: moving the app and its configuration
would touch import aliases, Next.js, TypeScript, lint, tests, CI and deployment
at the same time as the tenant-security work. This branch therefore adds no
mechanical moves and no placeholder connector packages.

## Exact migration sequence

1. Add npm workspaces in the root manifest and make `apps/web/package.json` the
   owner of the existing Next.js scripts and dependencies.
2. Move the current app-owned paths (`src`, `public`, `next.config.ts`,
   `next-env.d.ts`, `tsconfig.json`, `eslint.config.mjs`, and app tests) under
   `apps/web`; keep Supabase migrations and SQL tests at repository root under
   `supabase/`.
3. Update the web app's path alias, lint/test/build workflows, Vercel root
   directory, and documentation in the same change. Verify clean install,
   typecheck, lint, unit tests, build, and preview deployment before merging.
4. Extract `packages/shared-types` only when a contract is imported by both the
   web app and a connector. Create `packages/connector-core` with a tested
   capability/auth contract before adding `packages/connectors/github`.
5. Add Linear and then Notion as independent packages only after their real
   auth, permissions, operations and event contracts have been verified.

No connector API or capability is implied by this layout proposal.
