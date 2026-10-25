export type TeamRequestManifest = { format: "openmaus.team"; version: 2; team: {
  name: string; description: string; members: Array<{ key: string; name: string; title: string;
    description: string; appearance: { color: string } }>;
} };
export class TeamRequestError extends Error { readonly code: string; }
export function normalizeTeamRequestManifest(raw: unknown): TeamRequestManifest;
