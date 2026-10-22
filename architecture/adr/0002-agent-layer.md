# ADR 0002 — ATLAS Agent Layer

- Status: implemented through adapter boundaries; external mission transport and persistence are not configured
- Date: 2026-10-22
- Branch: `feat/atlas-agent-layer`
- Builds on: `feat/atlas-connector-engine`

## Decision

ATLAS Agent Layer has two server-side pieces:

1. **Context Resolver** builds a dossier for an authorized source resource. The first source is a GitHub pull request fetched through the existing server-side GitHub connector. It includes PR metadata, changed-file summaries, patches returned by GitHub, and related resources returned by the relationship store. Every resource is checked against the owner-scoped read policy before inclusion. Dossiers retain source URL, source update time, observed time and freshness. Diff text is capped at 12,000 characters per file and 40,000 characters total. Related-resource lookup is capped at 30 resources.
2. **Agent Bridge** accepts a stable agent id, actor, prompt, source and caller-provided idempotency key. It resolves context, reserves a request using `(ownerId, idempotencyKey)` and a request hash, creates a mission through `OpenMausBotMissionGateway`, records the mission/source relation, refreshes mission state, and records a report/source relation after a successful result. A changed payload with a reused key is a conflict. A timeout is an unknown outcome and must be reconciled before a retry.

The bridge does not implement agent execution or invent an OpenMausBot API. `OpenMausBotMissionGateway` is a typed boundary. `UnavailableOpenMausBotGateway` fails closed until a documented, authorized transport is supplied. Agent names are resolved from an injected, server-side catalog; the first `VISION` entry must use the actual team/agent ID from the configured runtime.

## Data and permissions

- The mission request contains only the allowed context dossier; it does not receive arbitrary ATLAS tables, credentials, or hidden resources.
- The owner and actor are carried separately and every repository lookup is owner-scoped. The production implementation must bind them to the authenticated ATLAS session, not request JSON supplied by the browser.
- Cross-system relations use typed provider/object references and an idempotent persistence port; they are distinct from the current connector relation row, which assumes a single provider connection.
- Text patches are supported from the GitHub PR files response. Document and image attachments can be added only by an authorized `readAttachment` implementation that actually returns content and provenance. No such adapter is in this repository yet.
- GitHub's live API enforces repository read access. ATLAS connection ownership, secret resolution, granted permissions and live capability checks remain server runtime responsibilities.

## Observed interfaces and limits

- The repository has no Next.js API route, session implementation, database client, durable mission store, or configured OpenMausBot gateway. The earlier Connector Engine ADR records the same backend boundary.
- The available GitHub connected tools can fetch PR metadata, changed filenames and patches in this assistant runtime. They are not callable from ATLAS HQ's server runtime. The repository has a server-side REST adapter, but ATLAS OAuth installation, secret vault and connection records are not configured here.
- The currently exposed OpenMausBot tool catalog has teammate coordination and bot administration tools, but no user-facing mission create/status/result API for an external ATLAS application. Internal agent-to-agent handoff is not a substitute for that API.
- Therefore the code can be contract-tested end to end with test ports, but a real PR → `@VISION` → OpenMausBot mission → report workflow cannot be truthfully executed yet.

## Required before activation

1. Supply the documented OpenMausBot mission transport and authorization model, including agent identity resolution, create idempotency, status, result/report retrieval, error mapping, and permissions.
2. Implement durable, transactional owner-scoped mission/request and cross-provider relation stores with uniqueness constraints.
3. Connect the existing server-side GitHub adapter to authenticated ATLAS sessions and a server-only secret vault; verify installation/repository permission and effective scopes at runtime.
4. Expose authenticated server routes and the shared `@agent` command selector in Workspaces, Apps, project, document, task and resource command surfaces. Keep mission status/result and source relations visible without treating GitHub copies as source of truth.
5. Add document/image source adapters only where their content can be read with the same owner and resource ACL checks.

No endpoint or production capability is claimed by this slice. No merge or deployment is part of this decision.
