import { mausbotRequest, MausbotAdapterError } from "./adapter.mjs";
import { storedMausbotAvatarPath } from "./avatar.mjs";

/**
 * Read-only "Teams & Chiefs" view (phase 1). Server-only. Every upstream source is
 * optional: when a MAUSBOT endpoint is missing or its shape differs, the view
 * degrades and lists the source under `degraded` instead of failing. Parsers are
 * tolerant of unknown fields (they are dropped) and project strings with caps.
 * No prompts, section-context text, memory, tool input or raw payload is relayed.
 */
export const MAUSBOT_TEAM_VIEW_ID = /^[A-Za-z0-9_-]{1,120}$/;
export const MAUSBOT_TEAM_VIEW_CACHE_MS = 20_000;
export const MAUSBOT_TEAM_VIEW_MIN_UPSTREAM_MS = 10_000;
const MAX_CHIEF_OVERVIEWS = 12;

export class TeamViewInputError extends Error {
  constructor(code) { super(code); this.name = "TeamViewInputError"; this.code = code; this.status = 400; }
}
const rec = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const list = (v) => Array.isArray(v) ? v.filter(rec) : [];
const str = (v, max = 160) => typeof v === "string" && v.length ? v.slice(0, max) : null;
const isId = (v) => typeof v === "string" && MAUSBOT_TEAM_VIEW_ID.test(v);
const count = (v) => typeof v === "number" && Number.isSafeInteger(v) && v >= 0 ? v : null;
const firstList = (payload, keys) => {
  if (Array.isArray(payload)) return list(payload);
  for (const k of keys) if (Array.isArray(payload?.[k])) return list(payload[k]);
  return null;
};
const time = (v) => typeof v === "number" && Number.isFinite(v) ? new Date(v).toISOString()
  : typeof v === "string" ? v.slice(0, 64) : null;

export function assertTeamViewId(value, code = "TEAM_VIEW_ID_INVALID") {
  if (!isId(value)) throw new TeamViewInputError(code);
  return value;
}

/** Bot status from MAUSBOT fleet / presence. */
export function teamViewStatus(bot, activeIds) {
  if (activeIds?.has(bot.id)) return "active";
  if (bot.busy === true || bot.working === true || ["running", "working", "busy"].includes(bot.activity)) return "active";
  if (bot.waitingForTeammates === true) return "waiting";
  return "idle";
}

export function parseTeamMap(payload) {
  // Accepts { teams: [{ chiefId, memberIds }] } or edges { links|edges|reports: [{ botId, reportsTo }] }.
  const teams = firstList(payload, ["teams", "sections", "groups"]);
  const edges = firstList(payload, ["links", "edges", "reports", "hierarchy"]);
  if (!teams && !edges) return null;
  const reportsTo = new Map();
  for (const team of teams ?? []) {
    const chief = [team.chiefId, team.chiefOfStaffId, team.chief_id, team.leadId].find(isId);
    const members = (Array.isArray(team.memberIds) ? team.memberIds : Array.isArray(team.members) ? team.members : [])
      .map((m) => (rec(m) ? m.id ?? m.botId : m)).filter(isId);
    if (chief) for (const m of members) if (m !== chief) reportsTo.set(m, chief);
  }
  for (const e of edges ?? []) {
    const from = [e.botId, e.id, e.from, e.bot_id].find(isId);
    const to = [e.reportsTo, e.chiefId, e.managerId, e.to, e.reports_to].find(isId);
    if (from && to && from !== to) reportsTo.set(from, to);
  }
  return reportsTo;
}

export function parsePresence(payload) {
  const rows = firstList(payload, ["active", "bots", "presence", "items"]);
  if (rows) return new Set(rows.map((r) => [r.botId, r.id, r.bot_id].find(isId)).filter(Boolean));
  const ids = Array.isArray(payload?.active) ? payload.active : Array.isArray(payload?.botIds) ? payload.botIds :
    Array.isArray(payload) ? payload : null;
  return ids ? new Set(ids.filter(isId)) : null;
}

export function parseSections(payload) {
  const rows = firstList(payload, ["sections", "items"]);
  if (!rows) return null;
  return rows.map((s) => ({ id: str(s.id ?? s.section ?? s.name, 60), label: str(s.label ?? s.name ?? s.title, 80) }))
    .filter((s) => s.id);
}

export function parseOverview(payload) {
  if (!rec(payload)) return null;
  const lm = rec(payload.lastMessage) ? payload.lastMessage : rec(payload.latestMessage) ? payload.latestMessage : null;
  const reports = [payload.openReports, payload.reportsOpen, payload.pendingReports, payload.openReportCount]
    .map((v) => Array.isArray(v) ? v.length : count(v)).find((v) => v !== null && v !== undefined);
  return {
    lastMessage: lm ? { text: str(lm.text, 280), at: time(lm.at ?? lm.createdAt), role: str(lm.role, 20) } : null,
    openReports: reports ?? null,
  };
}

export function parseActivity(payload) {
  const rows = firstList(payload, ["activity", "events", "items", "entries"]);
  if (!rows) return null;
  return rows.slice(0, 20).map((e) => ({
    at: time(e.at ?? e.createdAt ?? e.time), kind: str(e.kind ?? e.type, 40), title: str(e.title ?? e.summary ?? e.text, 200),
  }));
}

export function parseSectionContext(payload) {
  if (!rec(payload)) return null;
  // The section context TEXT is a private system prompt: only metadata is relayed.
  return { section: str(payload.section, 60), label: str(payload.label, 80),
    updatedAt: time(payload.updatedAt), hasText: typeof payload.text === "string" && payload.text.length > 0 };
}

/** Pure assembly, fully testable with fixtures. */
export function buildTeamView({ bots, teamMap, presence, sections, overviews = new Map(), degraded = [] }) {
  const fleet = list(bots).filter((b) => isId(b.id));
  const people = fleet.map((b) => ({
    id: b.id, name: str(b.name, 120) ?? b.id, title: str(b.title, 120), section: str(b.section, 60),
    chiefOfStaff: b.chiefOfStaff === true, hasAvatar: storedMausbotAvatarPath(b.avatarUrl) !== null,
    status: teamViewStatus(b, presence), unread: count(b.unread) ?? 0,
  }));
  const byId = new Map(people.map((p) => [p.id, p]));
  const chiefs = people.filter((p) => p.chiefOfStaff);
  const teams = chiefs.map((chief) => {
    const members = people.filter((p) => p.id !== chief.id && !p.chiefOfStaff && (
      teamMap?.has(p.id) ? teamMap.get(p.id) === chief.id : (!teamMap?.size && p.section && p.section === chief.section)));
    const ov = overviews.get(chief.id) ?? null;
    return {
      chief: { ...chief, lastMessage: ov?.lastMessage ?? null, openReports: ov?.openReports ?? null },
      members, sectionLabel: sections?.find((s) => s.id === chief.section)?.label ?? chief.section,
      activeCount: [chief, ...members].filter((p) => p.status === "active").length,
    };
  });
  const assigned = new Set(teams.flatMap((t) => [t.chief.id, ...t.members.map((m) => m.id)]));
  return {
    source: "live-read-only", teams,
    unassigned: people.filter((p) => !assigned.has(p.id)).slice(0, 200),
    activeTotal: people.filter((p) => p.status === "active").length,
    degraded: [...new Set(degraded)], generatedAt: new Date().toISOString(),
    knownIds: byId.size,
  };
}

async function optional(fetcher, path, parse, name, degraded) {
  try {
    const value = parse(await fetcher(path));
    if (value === null) degraded.push(name);
    return value;
  } catch (error) {
    if (error instanceof MausbotAdapterError && error.code === "MAUSBOT_AUTH_REFUSED") throw error;
    degraded.push(name);
    return null;
  }
}

export async function fetchMausbotTeamView(config, deps = {}) {
  const fetcher = (path) => mausbotRequest(config, path, deps);
  const fleet = await fetcher("/api/bots?messages=0");
  if (!Array.isArray(fleet?.bots)) throw new MausbotAdapterError("MAUSBOT_RESPONSE_INVALID", 502);
  const degraded = [];
  const teamMap = await optional(fetcher, "/api/team-map", parseTeamMap, "team-map", degraded);
  const sections = await optional(fetcher, "/api/sidebar-sections", parseSections, "sidebar-sections", degraded);
  const presence = await optional(fetcher, "/api/presence/active", parsePresence, "presence", degraded);
  const overviews = new Map();
  const chiefs = list(fleet.bots).filter((b) => b.chiefOfStaff === true && isId(b.id)).slice(0, MAX_CHIEF_OVERVIEWS);
  let overviewFailed = false;
  for (const chief of chiefs) {
    if (overviewFailed) break; // one missing endpoint = stop probing, keep request count low
    const ov = await optional(fetcher, "/api/bots/" + encodeURIComponent(chief.id) + "/overview", parseOverview, "overview", degraded);
    if (ov) overviews.set(chief.id, ov); else overviewFailed = true;
  }
  return buildTeamView({ bots: fleet.bots, teamMap, presence, sections, overviews, degraded });
}

/** Per-bot detail (overview + activity); the bot must be visible in the fleet. */
export async function fetchMausbotBotDetail(config, botId, deps = {}) {
  assertTeamViewId(botId);
  const fetcher = (path) => mausbotRequest(config, path, deps);
  const fleet = await fetcher("/api/bots?messages=0");
  if (!list(fleet?.bots).some((b) => b.id === botId)) throw new TeamViewInputError("TEAM_VIEW_BOT_NOT_VISIBLE");
  const degraded = [];
  const base = "/api/bots/" + encodeURIComponent(botId);
  const overview = await optional(fetcher, base + "/overview", parseOverview, "overview", degraded);
  const activity = await optional(fetcher, base + "/activity", parseActivity, "activity", degraded);
  return { source: "live-read-only", botId, overview, activity: activity ?? [], degraded };
}

export async function fetchMausbotSectionContext(config, section, deps = {}) {
  if (typeof section !== "string" || !/^[\p{L}\p{N} _&().-]{1,60}$/u.test(section)) {
    throw new TeamViewInputError("TEAM_VIEW_SECTION_INVALID");
  }
  const degraded = [];
  const ctx = await optional((p) => mausbotRequest(config, p, deps),
    "/api/section-context?section=" + encodeURIComponent(section), parseSectionContext, "section-context", degraded);
  return { source: "live-read-only", context: ctx, degraded };
}

/**
 * Tiny server cache: serves the same value for `ttlMs` and never contacts the
 * upstream more than once per `minUpstreamMs` per key, even after an error.
 */
export function createTeamViewCache({ ttlMs = MAUSBOT_TEAM_VIEW_CACHE_MS, minUpstreamMs = MAUSBOT_TEAM_VIEW_MIN_UPSTREAM_MS,
  now = () => Date.now(), maxKeys = 200 } = {}) {
  const entries = new Map();
  return {
    async get(key, load) {
      const t = now();
      const hit = entries.get(key);
      if (hit?.pending) return hit.pending;
      if (hit && (t - hit.at < ttlMs) && hit.ok) return { ...hit.value, cached: true };
      if (hit && t - hit.at < minUpstreamMs) {
        if (hit.ok) return { ...hit.value, cached: true };
        throw hit.error;
      }
      const pending = Promise.resolve().then(load).then(
        (value) => { entries.set(key, { at: t, ok: true, value }); return { ...value, cached: false }; },
        (error) => { entries.set(key, { at: t, ok: false, error }); throw error; });
      entries.set(key, { ...(hit ?? { at: 0 }), pending });
      while (entries.size > maxKeys) entries.delete(entries.keys().next().value);
      return pending;
    },
  };
}
