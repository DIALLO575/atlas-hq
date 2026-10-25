# MAUSBOT control from ATLAS — roadmap (P1 → P4)

Goal: drive MAUSBOT (Chiefs of Staff, teams, communication, reports, results)
from ATLAS **without saturating the single small MAUSBOT VPS** (1 vCPU, ~4 GB).
Nothing in this document is applied to any server. Caddy blocks below are
*proposals* to be reviewed and installed by the VPS operator with a backup.

## Common rules (all phases)

- Owner-only for writes and sensitive reads; workspace bound by `ATLAS_MAUSBOT_WORKSPACE_ID`.
- Every send passes through the **send dispatcher guard**
  (`packages/engines/mausbot/src/send-guard.mjs`):
  - max **2 active bots** in parallel (live fleet `busy/working/activity`);
    unknown presence → `503 MAUSBOT_SEND_PRESENCE_UNAVAILABLE` (never passes);
  - **60 s** between two sends to the same bot/channel, **20 s** between two
    different targets → `429` + `Retry-After`;
  - duplicate `send_id` / `Idempotency-Key` → `409` (plus the durable Supabase
    reservation `atlas_mausbot_action_begin`);
  - a bot/automation-initiated send never wakes a Chief of Staff → `403`
    (`/api/engines/mausbot/dispatch` is treated as automation);
  - kill switch `ATLAS_MAUSBOT_SEND_KILL_SWITCH=true` → `423` on every send (default off).
  - Limit: windows live in server memory (per warm instance). The audit table stores
    no target id and is not readable by `authenticated`, so it cannot back them
    without a new migration (to plan in P3).
- **Forbidden MAUSBOT routes, never proxied by ATLAS nor opened in Caddy:**
  `computer*`, `browser*`, `secrets*`, `logins*`, `auth*` (except a future
  `auth/stream-ticket`), `config*`, `internal*`, `workspace-backup*`, `cloud-*`.
- Ids validated with `^[A-Za-z0-9_-]{1,120}$`; tolerant parsers drop unknown fields;
  no prompts, section-context text, memory text, tool input or secrets reach the browser.
- Vercel quota: grouped PRs, one preview per batch, one production deploy per day max.

## P1 — See (this PR)

- Send dispatcher guard on `conversations.messages.send` / `channels.messages.send`
  and agent dispatch.
- `GET /api/engines/mausbot/teams?workspaceId=` (owner only): Chiefs + members,
  status (presence/fleet), last message + open reports (chief overview), section labels.
  `&botId=` → overview + activity; `&section=` → section-context metadata only.
  Server cache 20 s, at most one upstream refresh per 10 s per key.
  Missing endpoints degrade (`degraded: [...]`) instead of failing.
- UI: "Chiefs of Staff" board in the Agents workspace (375 px friendly).

## P2 — Feed

Single feed of reports, results, reminders and requests (needs-you, message
updates, routines read), with search. Read-only.

## P3 — Act

Durable send queue (Supabase table with target id + timestamps, replacing the
in-memory windows), shared "chiefs-of-staff" channel, buttons for tasks, jobs,
routines; per-action confirmation and audit.

## P4 — Operate

Audit/costs dashboards, produced files/exports, mobile push notifications.

## Proposed Caddy block (GET only, phase 1 routes) — NOT APPLIED

Same style as `@atlas_avatar_images`. To insert in the `mausbot.shadoron.com`
site **before** the catch-all, after backup + `caddy validate`.

```caddy
@atlas_p1_team_reads {
	method GET
	header Authorization "Bearer *"
	path_regexp atlas_p1 ^/api/(team-map|sidebar-sections|section-context|presence/active|bots/[A-Za-z0-9_-]{1,120}/(overview|activity))$
}
handle @atlas_p1_team_reads {
	header Cache-Control "private, no-store"
	header -Server
	reverse_proxy 127.0.0.1:8799
}
```

Notes: query strings (`?section=`) are not part of `path`, the regex is anchored,
MAUSBOT still validates the session behind the Bearer header, and no POST/PATCH
is opened by this block. Verify after reload: 200 with a valid Bearer, 401/404
without, 404 for `/api/bots/../config/overview`.
