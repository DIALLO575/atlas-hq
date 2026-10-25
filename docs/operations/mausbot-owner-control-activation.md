# ATLAS owner controls → MAUSBOT (no tailnet path)

This branch adds explicit owner-initiated primitive commands with a durable
idempotency reservation. It intentionally does not deploy, bypass MAUSBOT auth,
grant shell access, or enable autonomous background dispatch. The existing
approval and governance routes remain separate.

Prerequisites before release:
1. Run migration `20261025190000_atlas_mausbot_owner_action_audit.sql`
   on the correct ATLAS Supabase project, and verify authenticated owner RPC
   invocation plus forbidden non-owner and duplicate UUID outcomes.
2. Provision a **new dedicated MAUSBOT admin session** exclusively to the
   Vercel Production secret `ATLAS_MAUSBOT_TOKEN`; never extract session
   secrets into chat, GitHub, or CI. Verify exact installation identity.
3. Review and extend Caddy `mausbot.shadoron.com` route allowlist for
   only specific native primitives' POST/PATCH URLs, **with upstream session
   verification and no raw wildcard/admin/config routes**. Restrict to
   authenticated action surface; keep official Tailscale clients independent.
4. Validate actual E2E: 403 for non-owner ATLAS session; 404 unauthenticated
   Caddy; 403 invalid MAUSBOT token; duplicate idempotency returns 409;
   confirm one successful message, one cancelled request, and no double send.
   Audit any uncertain outcome instead of blind retry.
5. Only after these validations, set on Vercel Production:
   `ATLAS_MAUSBOT_RELEASE_STAGE=admin`,
   `ATLAS_MAUSBOT_ADMIN_CONTROL_ENABLED=true` and
   `ATLAS_MAUSBOT_ADMIN_IDENTITY_VERIFIED=true`.
   Workspaces are bound by `ATLAS_MAUSBOT_WORKSPACE_ID`; only `owner` gets
   direct control. Preview must not inherit Production credentials.
6. Build once after changes, verify SHA READY, smoke test the Agents composer,
   then monitor MAUSBOT/Vercel logs for owner actions and anomalous traffic.

Emergency stop: set `ATLAS_MAUSBOT_ADMIN_CONTROL_ENABLED=false` and
`ATLAS_MAUSBOT_RELEASE_STAGE=read-only`, revoke upstream MAUSBOT session,
and remove Caddy mutation paths. Existing deployments need fresh runtime env
to pick up changes. **Production defaults remain safe unless explicitly released.**

Scope: the 20 source-mapped ATLAS primitives only; broader MAUSBOT
approval cards, credential settings, direct terminal and computer control
are NOT implemented by this change and should have distinct threat reviews.
