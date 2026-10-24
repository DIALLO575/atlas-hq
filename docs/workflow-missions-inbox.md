# Missions + Inbox V1 — real workspace workflow

This changes both Atlas pages together. Neither page displays fake missions, agent events or fake approvals.

## What actually works (after database migration and deployment)
- Missions: workspace selector, create (title, description, priority), start, mark finished, request an administrative review.
- Inbox: real review requests created from Missions; admin/owner approves or rejects; requesters see their submitted requests and the outcome. Decisions atomically update the related mission's status through a SECURITY INVOKER RPC.
- Auth: Supabase getUser and server membership checks for every write. Read access restricted by workspace RLS, decisions additionally restricted to admins/owners. Inserts stamp the authenticated user.
- Review decision audit values are supplied by a database trigger, not by clients.
- Each page handles empty workspace, no results, error and disabled service without made-up data.

## Actual deployment prerequisites
1. Review migration `supabase/migrations/20261023235000_atlas_missions_inbox_workflow.sql` and test it on a disposable Supabase database.
2. Apply the migration to the intended Atlas database BEFORE deploying new UI/server actions. No migration is automatically applied by this PR.
3. Deploy this branch to preview and validate with two real workspace members with different roles; verify a cross-workspace request cannot be read or changed.
4. Merge to main and verify Vercel's production deployment SHA and live browser behavior.
5. The current Vercel team may be blocked by daily deployment limits; build/CI alone does not prove availability on the production hostname.

## MVP scope
- Up to 200 most-recent missions/reviews are displayed for a workspace; totals are labeled as visible counts.
- Completing a mission directly is currently permitted for its creator or workspace admin; requesting independent approval is an optional workflow. Do not claim completion always requires approval.
- This is an Atlas-native workflow; nothing is inferred from external providers, CI runs or AI agents until those services write verified events.
- No background polling, notifications, emails, webhook ingestion or agent actions are implemented.


## Verified later state (24 October 2026)
The workflow schema migration was applied to the official Atlas Supabase database and the Missions/Inbox pages are deployed in the previously published production build. The deployment prerequisites above remain useful as the **reproduction procedure**, not as instructions to reapply the migration. Latest read-only official counts: 1 workspace, 0 missions, 0 review requests. No live two-user end-to-end approval test is evidenced here; complete such validation before claiming operational readiness. More: [worker handoff](../operations/worker-handoff-2026-10-24.md).
