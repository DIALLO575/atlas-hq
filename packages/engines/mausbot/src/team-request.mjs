import { planTeamChannelMutation } from "./team-channel-contracts.mjs";
export class TeamRequestError extends Error {
  constructor() { super("TEAM_REQUEST_MANIFEST_INVALID"); this.code = "TEAM_REQUEST_MANIFEST_INVALID"; }
}
const fail = () => { throw new TeamRequestError(); };
const rec = value => value !== null && typeof value === "object" && !Array.isArray(value);
function exact(value, fields) {
  if (!rec(value) || Object.keys(value).length !== fields.length || fields.some(key => !Object.hasOwn(value, key))) fail();
}
/** Narrow initial profile-only import. No tools, model, soul, grants, files or URLs. */
export function normalizeTeamRequestManifest(raw) {
  exact(raw, ["format", "version", "team"]);
  exact(raw.team, ["name", "description", "members"]);
  if (!Array.isArray(raw.team.members) || raw.team.members.length < 1 || raw.team.members.length > 12) fail();
  for (const member of raw.team.members) {
    exact(member, ["key", "name", "title", "description", "appearance"]);
    exact(member.appearance, ["color"]);
    if (typeof member.title !== "string" || typeof member.description !== "string" || member.description.length > 1000 || /[\x00-\x1f\x7f]/.test(member.title)) fail();
  }
  if (typeof raw.team.description !== "string" || raw.team.description.length > 1000) fail();
  let manifest;
  try { manifest = planTeamChannelMutation("teams.import", { manifest: raw }).body; }
  catch { fail(); }
  return { format: "openmaus.team", version: 2, team: {
    name: manifest.team.name.trim(), description: manifest.team.description.trim(),
    members: manifest.team.members.map(member => ({ key: member.key, name: member.name.trim(),
      title: member.title.trim(), description: member.description.trim(), appearance: { color: member.appearance.color } })),
  } };
}
