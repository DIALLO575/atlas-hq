# Chief Command Deck v1

Illustration-inspired functional Chief interface at /chief, using existing Atlas workspace data. This is not an external LLM or autonomous agent connection.

- Authenticated server-rendered initial briefing via readAtlasWorkflow(), with RLS enforced on missions and reviews.
- POST /api/chief reads the current workspace on every prompt and generates honest typed summary cards and per-status chart. Unsupported questions explain supported briefing commands. No code execution, external AI calls, hallucinated tasks or write actions.
- Responsive three-column workspace UI: temporary conversation sessions, chat area, sidebar with real Missions/Inbox context, top workspace selector, actions that link to real service pages.
- GitHub sidebar calls existing secured workspace-scoped API for verified installations, authorized repositories and PRs of the first authorized repository. Clearly scoped labels prevent accidental invented aggregate totals.
- Chat history only lives in client React state for the current page session; it is never saved to database or sent to third-party LLMs.
- Homepage Chief composer now opens /chief?prompt=... with a functional grounded briefing.
- Charts represent current mission status distribution, not historical trends, since events tracking is not implemented.
- Data is bounded to the recent 200 missions/reviews in readAtlasWorkflow. Counts are for visible items only.

Next phase (requires explicit integration): agent/model provider, encrypted persistent conversations, actual streaming, server tools, permissions+approvals for autonomous actions, event timeline and richer analytics.


## Release/handoff evidence (2026-10-24)
- Code intégré dans GitHub main par [PR #29](https://github.com/DIALLO575/atlas-hq/pull/29), commit applicatif `832dce2` ; CI success, preview combinée READY.
- L'URL de production officielle pointe encore vers `db3152e` à la date du rapport (Vercel 402). Ne pas déclarer Chief déployé en production.
- La page consomme réellement les tables workspace Missions/Inbox : snapshot actuel 0 mission/0 validation, donc graphiques et cartes à zéro attendus.
- Aucune conversation persistante, LLM, streaming, actions d'agents ou analytics historiques. Voir [SHA-119](https://linear.app/shadoron/issue/SHA-119/atlas-chief-v2-modele-ia-memoire-des-chats-et-actions-avec-approbation).
- Suite de travail : [handoff inter-workers](../operations/worker-handoff-2026-10-24.md).
