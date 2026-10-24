import { mausbotRequest, MausbotAdapterError } from "./adapter.mjs";
import { nativePrimitive, planNativePrimitive } from "../../../engine-core/src/native-capabilities.mjs";
import { planMausbotCli } from "./protocols.mjs";

/**
 * Teams + channels, source-audited from OpenMausBot server/routes/teams.ts
 * and server/routes/channels.ts. NONE of these actions is BFF-exposed or
 * callable. They are plans requiring durable approval/ACL + revalidation.
 */
export const TEAM_CHANNEL_MUTATION_PLANS = Object.freeze([
  "teams.export",
  "teams.import",
  "teams.organization.install",
  "channels.mark-read",
  "channels.queue.cancel",
  "channels.queue.steer",
  "channels.members.compact",
  "channels.tasks.delete",
]);

export const TEAM_CHANNEL_METADATA_READS = Object.freeze([
  "teams.library.catalog",
  "teams.organization.catalog",
]);

export class TeamChannelContractError extends Error {
  constructor(code) { super(code); this.name = "TeamChannelContractError"; this.code = code; this.status = 400; }
}
const fail = (code) => { throw new TeamChannelContractError(code); };
const object = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const objectId = (v) => typeof v === "string" && /^[A-Za-z0-9_-]{1,120}$/.test(v);
const packageId = (v) => typeof v === "string" && /^[a-f0-9-]{36}$/.test(v);
const text = (v, max) => typeof v === "string" && v.trim().length > 0 && v.length <= max && !/[\x00-\x1f\x7f]/.test(v);
const out = (v, n = 160) => typeof v === "string" ? v.slice(0, n) : null;
const number = (v) => Number.isSafeInteger(v) && v >= 0 ? v : null;
const yes = (v) => v === true;
function shape(value, allowed, required) {
  if (!object(value)) fail("TEAM_CHANNEL_INPUT_INVALID");
  if (Object.keys(value).some((key) => !allowed.includes(key))) fail("TEAM_CHANNEL_FIELD_NOT_ALLOWED");
  if (required.some((key) => !Object.hasOwn(value, key))) fail("TEAM_CHANNEL_FIELD_REQUIRED");
}
function path(spec, ids) {
  try { return planNativePrimitive(spec, ids).path; }
  catch { return fail("TEAM_CHANNEL_PATH_INVALID"); }
}
function ensureId(value) { if (!objectId(value)) fail("TEAM_CHANNEL_ID_INVALID"); return value; }


const MAUSBOT_COLORS = new Set([
  "green", "blue", "red", "orange", "purple", "cyan", "pink",
  "yellow", "teal", "coral", "silver", "chrome",
]);
function optionalText(value, max) {
  return value === undefined || (typeof value === "string" &&
    value.length <= max && !/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(value));
}
/**
 * v2 team manifest is intentionally restricted to known member fields.
 * No arbitrary engine approval, computer configuration, connection, secret,
 * cwd, grants, runtime, or external URL fields may cross this boundary.
 */
function prepareV2TeamManifest(raw) {
  shape(raw, ["format", "version", "team"], ["format", "version", "team"]);
  if (raw.format !== "openmaus.team" || raw.version !== 2) fail("TEAM_MANIFEST_VERSION_UNSUPPORTED");
  const team = raw.team;
  shape(team, ["name", "description", "members"], ["name", "members"]);
  if (!text(team.name, 100) || !optionalText(team.description, 2000)) fail("TEAM_MANIFEST_TEAM_INVALID");
  if (!Array.isArray(team.members) || team.members.length < 1 || team.members.length > 50) {
    fail("TEAM_MANIFEST_MEMBERS_INVALID");
  }
  const unique = new Set();
  const members = team.members.map((member) => {
    shape(member, ["key", "name", "title", "description", "soul", "appearance"],
      ["key", "name", "appearance"]);
    if (typeof member.key !== "string" || !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(member.key) ||
        unique.has(member.key)) fail("TEAM_MANIFEST_MEMBER_KEY_INVALID");
    unique.add(member.key);
    if (!text(member.name, 100) || !optionalText(member.title, 200) ||
        !optionalText(member.description, 4000) ||
        !optionalText(member.soul, 24000) ||
        (typeof member.soul === "string" && Buffer.byteLength(member.soul, "utf8") > 24000)) {
      fail("TEAM_MANIFEST_MEMBER_INVALID");
    }
    shape(member.appearance, ["color", "mascotExpression", "mascotBody"], ["color"]);
    if (!MAUSBOT_COLORS.has(member.appearance.color) ||
        !optionalText(member.appearance.mascotExpression, 80) ||
        !optionalText(member.appearance.mascotBody, 40)) fail("TEAM_MANIFEST_APPEARANCE_INVALID");
    return {
      key: member.key, name: member.name,
      ...(member.title !== undefined ? { title: member.title } : {}),
      ...(member.description !== undefined ? { description: member.description } : {}),
      ...(member.soul !== undefined ? { soul: member.soul } : {}),
      appearance: {
        color: member.appearance.color,
        ...(member.appearance.mascotExpression !== undefined ? { mascotExpression: member.appearance.mascotExpression } : {}),
        ...(member.appearance.mascotBody !== undefined ? { mascotBody: member.appearance.mascotBody } : {}),
      },
    };
  });
  const result = {
    format: "openmaus.team", version: 2,
    team: { name: team.name,
      ...(team.description !== undefined ? { description: team.description } : {}),
      members },
  };
  if (Buffer.byteLength(JSON.stringify(result), "utf8") > 65536) fail("TEAM_MANIFEST_TOO_LARGE");
  return result;
}

/**
 * Offline plans carry no approval receipts. They MUST NOT be applied with a
 * browser-provided "approved" boolean. Team exports can contain confidential
 * standing instructions; never return their raw documents to unauthorized clients.
 */
export function planTeamChannelMutation(name, input) {
  if (!TEAM_CHANNEL_MUTATION_PLANS.includes(name)) fail("TEAM_CHANNEL_ACTION_NOT_IMPLEMENTED");
  const spec = nativePrimitive(name);
  if (!spec || spec.method === "GET") fail("TEAM_CHANNEL_SOURCE_MISMATCH");
  let ids = {}, body = undefined;
  switch (name) {
    case "teams.export":
      shape(input, ["name"], ["name"]);
      if (!text(input.name, 100)) fail("TEAM_CHANNEL_NAME_INVALID");
      // Explicitly exclude backup and package formats: they can carry credentials,
      // private transcripts, memory or grant-related metadata.
      body = { name: input.name.trim(), format: "manifest" };
      break;
    case "teams.import":
      shape(input, ["manifest"], ["manifest"]);
      body = prepareV2TeamManifest(input.manifest);
      break;
    case "teams.organization.install":
      shape(input, ["packageId"], ["packageId"]);
      if (!packageId(input.packageId)) fail("TEAM_CHANNEL_PACKAGE_INVALID");
      body = { packageId: input.packageId };
      break;
    case "channels.mark-read":
      shape(input, ["channelId"], ["channelId"]);
      ids = { channelId: ensureId(input.channelId) };
      break;
    case "channels.queue.cancel":
      shape(input, ["channelId", "queueId"], ["channelId", "queueId"]);
      ids = { channelId: ensureId(input.channelId), queueId: ensureId(input.queueId) };
      break;
    case "channels.queue.steer":
      shape(input, ["channelId", "queueId", "threadId"], ["channelId", "queueId", "threadId"]);
      ids = { channelId: ensureId(input.channelId), queueId: ensureId(input.queueId) };
      body = { threadId: ensureId(input.threadId) };
      break;
    case "channels.members.compact":
      shape(input, ["channelId", "memberId"], ["channelId", "memberId"]);
      ids = { channelId: ensureId(input.channelId), memberId: ensureId(input.memberId) };
      break;
    case "channels.tasks.delete":
      shape(input, ["channelId", "threadIds"], ["channelId", "threadIds"]);
      ids = { channelId: ensureId(input.channelId) };
      if (!Array.isArray(input.threadIds) || input.threadIds.length < 1 || input.threadIds.length > 500 ||
          !input.threadIds.every(objectId) || new Set(input.threadIds).size !== input.threadIds.length) {
        fail("TEAM_CHANNEL_THREADS_INVALID");
      }
      // Runtime MUST also ensure each thread belongs to this channel and
      // that the channel retains at least one task.
      body = { threadIds: [...input.threadIds] };
      break;
    default: fail("TEAM_CHANNEL_ACTION_NOT_IMPLEMENTED");
  }
  return Object.freeze({
    primitive: name, method: spec.method,
    path: path(name, ids) + (name === "teams.import" ? "?mode=add" : ""),
    ...(body === undefined ? {} : { body: Object.freeze(body) }),
    requiresHumanApproval: true,
    requiresWorkspaceAuthorization: true,
    requiresRuntimeOwnershipCheck: name.startsWith("channels."),
    requiresDurableAudit: true,
    retryPolicy: "never-automatic",
    callable: false, hostTested: false, released: false,
  });
}
const projection = (value) => {
  if (!object(value)) throw new MausbotAdapterError("TEAM_CATALOG_RESPONSE_INVALID", 502);
  return value;
};
const list = (value) => {
  if (!Array.isArray(value) || value.length > 100) throw new MausbotAdapterError("TEAM_CATALOG_RESPONSE_INVALID", 502);
  return value;
};

/** Read-only, metadata-only; not routed from /api/engines. */
export function planTeamCatalogRead(name) {
  if (!TEAM_CHANNEL_METADATA_READS.includes(name)) fail("TEAM_CATALOG_READ_NOT_IMPLEMENTED");
  const spec = nativePrimitive(name);
  if (!spec || spec.method !== "GET") fail("TEAM_CATALOG_SOURCE_MISMATCH");
  return Object.freeze({ primitive: name, path: path(name, {}), method: "GET",
    mode: "metadata-only", callable: false, hostTested: false, released: false });
}
export async function executeTeamCatalogRead(config, name, deps = {}) {
  const plan = planTeamCatalogRead(name);
  const payload = projection(await mausbotRequest(config, plan.path, deps));
  if (name === "teams.library.catalog") {
    if (payload.format !== "openmaus.catalog" || payload.version !== 1) {
      throw new MausbotAdapterError("TEAM_CATALOG_RESPONSE_INVALID", 502);
    }
    const teams = list(payload.teams).map((raw) => {
      const team = projection(raw);
      return { slug: out(team.slug, 80), name: out(team.name, 100),
        category: out(team.category, 80), summary: out(team.summary, 300),
        members: number(team.members), featured: yes(team.featured),
        requiredApps: Array.isArray(team.requires?.apps)
          ? team.requires.apps.filter((app) => typeof app === "string").slice(0, 30).map((s) => s.slice(0, 80))
          : [] };
    });
    return { primitive: name, untrusted: true, mode: "metadata-only", teams };
  }
  // /api/org-library also returns organization:null when no managed library is available.
  const org = object(payload.organization) ? payload.organization : null;
  const packages = list(payload.packages).map((raw) => {
    const value = projection(raw);
    return { packageId: out(value.packageId, 36), name: out(value.name, 100),
      kind: out(value.kind, 40), mode: out(value.mode, 40),
      publisher: object(value.publisher) ? out(value.publisher.name, 100) : null,
      release: object(value.release) ? out(value.release.version, 60) : null };
  });
  return { primitive: name, untrusted: true, mode: "metadata-only",
    organization: org ? { name: out(org.name, 100) } : null,
    packages };
}

/** Existing safe CLI plans. A durable worker, not Next.js, runs them later. */
export function planTeamCliInspection(action, args = {}) {
  if (!["teams.dry-run", "teams.check"].includes(action)) fail("TEAM_CLI_ACTION_NOT_ALLOWED");
  const planned = planMausbotCli(action, args);
  return Object.freeze({ ...planned, requiresDurableWorker: true,
    callable: false, hostTested: false, released: false, mayExecuteMutations: false });
}
