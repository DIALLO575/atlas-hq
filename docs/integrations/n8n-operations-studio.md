# n8n Operations Studio — Mes Apps / Atlas UI

## Delivery scope

Atlas operations-console UI rework, kept on top of SHA-180 / PR09, **not** on merged `main`. The interface does not claim a live n8n provider connection; it provides a genuinely navigable, workspace-authenticated console for registered offline instances, stored workflow metadata, and stored execution status.

**Navigation:** Mes Apps highlighted n8n card → `/apps/n8n` → Overview, Workflows, Executions, Connexion & sécurité. Existing Atlas `AppShell` stays persistent. Chief / Agents / Missions / Moteurs links preserve workspace via URL search parameter.

**User actions actually enabled:**
- Read authorized workspace-scoped n8n engine instances from existing Atlas status route.
- Owner/admin can register one n8n **offline** instance through existing authorized same-origin `POST /api/engines/instances`. No provider URL, API key, credentials or secret form.
- Read stored n8n workflow references; search by name/remote ID; filter historical sync state; refresh independently without navigating away.
- Read stored execution records; search by workflow name; filter historical execution status; see whether the event linked an Atlas mission; refresh.
- Switch workspace (old workspace's stale response never displayed), inspect connection/configuration state and app surface status.
- Read-only capability view of REST/MCP/Webhooks, with all write/execute actions unavailable.

**Not enabled:** provisioning a real n8n runtime, live API key/REST/MCP discovery, workflow creation, publish, edit, test, execute, webhook dispatch, real time event subscriptions, remote permissions, actual agent certification or model/Chief V2 execution. Those remain locked by SQL offline check and n8n release gate.

**Source-proven metrics:** workspace-scoped, at most 50 stored workflows/executions from existing `coordination` projection (truncation marked with +). Empty registry is not proof of empty remote n8n. No API/server migration in this PR. Never use sample workflows for a false active-state UI.

## Original design direction

This is **Atlas UI**, not an embedded/recreated n8n workflow builder. Reflect n8n's evolved identity with one light pink-coral signature accent and warm coral interaction colors, on neutral Atlas surfaces. The brand guide currently names accent `#FF91AC` and neutral core `#191919`/`#FAFAFA`; warm companion `#F16C50` is an **Atlas-specific complementary UI tone**, not an assertion that it is an official n8n brand color. Existing local n8n brand asset is reused; no font/logo file is copied. Device-sized CSS grid, focus-visible states, legible empty states and dark mode are included.

Official branding reference: https://guidelines.n8n.design/colors (review on future design refresh).

## Verification

`tests/n8n-operations-studio.test.mjs` verifies app directory discoverability, four tabs and cross-links, bounded metrics, offline registration permissions, lack of provider dispatch, workspace switch anti-leak, filters for workflows and executions, no SQL gate relaxation, and responsive/pink-coral Atlas-themed CSS.

CI to run: Node tests, TypeScript check, ESLint, Next.js build, existing Postgres suites, npm audit and Gitleaks.

**Release posture:** draft PR stacked onto PR09, not merged or deployed; no Supabase migration. Live browser UX E2E requires authenticated staging and test tenants after merge. Do not imply user can see the UI in production yet.
