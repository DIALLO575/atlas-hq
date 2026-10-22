# ATLAS Agent Layer — frontend

## Acceptance criteria

- `AgentLayerPanel` accepts a resource view built from the authorized `ContextDossier`; without one it shows an explicit no-resource state.
- Mention suggestions display the backend `AgentIdentity` catalog. The known VISION identity from the team roster is labeled as roster-only with unknown runtime activation; it cannot launch a mission.
- The panel previews only facts and attachments supplied by the server Context Resolver, along with source freshness and observation time. It does not offer arbitrary client-side context attachments.
- Mission creation requires a ready server bootstrap, a server-origin enabled agent, a resource dossier and a prompt. The client sends a source `ResourceRef`, not owner or actor IDs; those must come from the authenticated server session.
- A stable idempotency key is reused if the create call must be retried. Status and report render only from typed `MissionReceipt` and `MissionSnapshot` responses.
- Loading, unavailable, error, no-resource, no-report and empty states remain explicit. Unsupported document/image attachment actions are not offered until their source adapter returns authorized content.
- Controls are labeled and keyboard operable, focus is visible, status/errors are announced, and the contextual surfaces stack on mobile.

## Contract alignment and current seam

The panel consumes J.A.R.V.I.S.'s contracts in `src/lib/agents/contracts.ts`: `AgentIdentity`, `ResourceRef`, `MissionReceipt` and `MissionSnapshot`. The browser-safe `AgentResourceContext` is a view model the server page should derive from a successfully resolved `ContextDossier` and provenance; it should not expose `ownerId`.

The frontend expects an authenticated `POST /api/agent-bridge/missions` returning `MissionReceipt`, and `GET /api/agent-bridge/missions/{missionId}` returning `MissionSnapshot`. These Next.js routes are integration seams, not present implementations. The repository has no authenticated API routes, mission store, live GitHub connection records, PR detail view, or configured OpenMausBot gateway. The Agents page therefore passes an unavailable bootstrap; no mission can be launched and no result is fabricated.

The backend ADR (`architecture/adr/0002-agent-layer.md`) documents the current blockers and transport contract. VISION's team identity is known in the roster, but runtime activation and live presence must come from the server catalog.

## Verification

- `npm test`: checks the shared backend type boundary, launch gating, mission/status/report provenance, no-resource state and accessibility markers.
- `npm run lint`, `npm run typecheck`, `npm run build`: local static checks.
- No production deployment or merge is part of this change.
