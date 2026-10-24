import { mausbotRequest, MausbotAdapterError } from "./adapter.mjs";
import { nativePrimitive, planNativePrimitive } from "../../../engine-core/src/native-capabilities.mjs";

/**
 * Safe, offline-testable read adapters for the MAUSBOT native HTTP surface.
 * IMPORTANT: NOT registered as an HTTP BFF action yet. ATLAS must add durable
 * engine-instance bindings, policy enforcement and tenant isolation first.
 * All responses are METADATA ONLY: no memory text, SKILL.md, diffs, secrets,
 * filesystem paths, OAuth credentials, executable tool input, or screenshots.
 */
export const NATIVE_METADATA_READS = Object.freeze([
  "memory.bot.inspect",
  "memory.bot.read-file",
  "memory.bot.journal",
  "memory.bot.upkeep-status",
  "skills.bot.list",
  "skills.bot.read",
  "skills.library.list",
  "skills.library.read",
  "memory.team.list",
  "memory.section.get",
  "skills.organization.list",
]);

export class NativePrimitiveInputError extends Error {
  constructor(code) { super(code); this.name = "NativePrimitiveInputError"; this.code = code; this.status = 400; }
}
const item = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const isId = (value) => typeof value === "string" && /^[A-Za-z0-9_-]{1,120}$/.test(value);
const skill = (value) => typeof value === "string" && /^[a-z0-9-]{1,80}$/.test(value);
const isSection = (value) => typeof value === "string" && value.length <= 60 &&
  /^[\p{L}\p{N} _&().-]*$/u.test(value);
const docName = "[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}\\.md";
const pathPattern = new RegExp("^(?:MEMORY\\.md|memory/" + docName + "|memory/log/" + docName + ")$");
const limit = (value, min, max) => Number.isInteger(value) && value >= min && value <= max;
const str = (value, max = 160) => typeof value === "string" ? value.slice(0, max) : null;
const int = (value) => typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
const yes = (value) => value === true;
const arr = (value, code = "NATIVE_RESPONSE_INVALID") => {
  if (!Array.isArray(value)) throw new MausbotAdapterError(code, 502);
  return value;
};
const rec = (value) => {
  if (!item(value)) throw new MausbotAdapterError("NATIVE_RESPONSE_INVALID", 502);
  return value;
};
const values = (v, cap = 25, len = 140) => Array.isArray(v) ? v.filter((x) => typeof x === "string").slice(0, cap).map(x => x.slice(0, len)) : [];
function ensureBotExists(state, botId) {
  if (!arr(state.bots).some((bot) => bot?.id === botId)) throw new NativePrimitiveInputError("NATIVE_BOT_NOT_VISIBLE");
}
function projectFile(file) {
  const x = rec(file);
  return { path: str(x.path), name: str(x.name), bytes: int(x.bytes), modifiedAt: int(x.modifiedAt) };
}
function projectSkill(s) {
  const x = rec(s);
  return {
    name: str(x.name), description: str(x.description, 500),
    enabled: yes(x.enabled), origin: str(x.origin, 60),
    editable: yes(x.editable), warnings: values(x.warnings, 16, 200),
    importedAt: str(x.importedAt, 60), tags: values(x.tags, 12, 40),
    // sha256 is safe to show for content verification; URL/source omitted.
    sha256: str(x.sha256, 64),
  };
}
const projectMemo = (memo) => {
  const x = rec(memo);
  return {
    id: str(x.id), at: int(x.at), path: str(x.path),
    kind: str(x.kind, 30), actor: str(x.actor, 30),
    canRevert: yes(x.canRevert), added: int(x.added), removed: int(x.removed),
    // before, diff, thread title, hashes and filesystem location intentionally omitted
  };
};
function validateRead(name, input) {
  if (!NATIVE_METADATA_READS.includes(name)) throw new NativePrimitiveInputError("NATIVE_READ_NOT_SUPPORTED");
  if (!item(input)) throw new NativePrimitiveInputError("NATIVE_INPUT_INVALID");
  const spec = nativePrimitive(name);
  if (!spec || spec.method !== "GET") throw new NativePrimitiveInputError("NATIVE_SOURCE_MISMATCH");
  const fields = name.startsWith("memory.bot") ? ["botId"] :
    name.startsWith("skills.bot") ? ["botId", ...(name === "skills.bot.read" ? ["skillId"] : [])] :
    name === "memory.team.list" || name === "memory.section.get" ? ["section"] :
    name === "skills.library.read" ? ["skillId"] : [];
  if (name === "memory.bot.read-file") fields.push("path");
  if (name === "memory.bot.journal") fields.push("limit");
  if (Object.keys(input).some((key) => !fields.includes(key))) throw new NativePrimitiveInputError("NATIVE_FIELD_NOT_ALLOWED");
  for (const field of fields) {
    if ((field === "botId" || field === "skillId" || field === "section" ||
        (field === "path" && name === "memory.bot.read-file")) && !(field in input))
      throw new NativePrimitiveInputError("NATIVE_FIELD_REQUIRED");
  }
  if ("botId" in input && !isId(input.botId)) throw new NativePrimitiveInputError("NATIVE_ID_INVALID");
  if ("skillId" in input && !skill(input.skillId)) throw new NativePrimitiveInputError("NATIVE_SKILL_INVALID");
  if ("section" in input && !isSection(input.section)) throw new NativePrimitiveInputError("NATIVE_SECTION_INVALID");
  if ("path" in input && (typeof input.path !== "string" || !pathPattern.test(input.path))) {
    throw new NativePrimitiveInputError("NATIVE_MEMORY_PATH_INVALID");
  }
  if ("limit" in input && !limit(input.limit, 1, 200)) throw new NativePrimitiveInputError("NATIVE_LIMIT_INVALID");
  return Object.freeze({ ...input });
}

export function planMausbotNativeRead(name, input = {}) {
  const args = validateRead(name, input);
  const pathIds = Object.fromEntries(Object.entries(args).filter(([k]) => k === "botId" || k === "skillId"));
  const route = planNativePrimitive(name, pathIds);
  const search = new URLSearchParams();
  if ("section" in args) search.set("section", args.section);
  if ("path" in args) search.set("path", args.path);
  if ("limit" in args) search.set("limit", String(args.limit));
  return Object.freeze({ primitive: name, method: "GET",
    path: route.path + (search.size ? "?" + search.toString() : ""), mode: "metadata-only",
    hostTested: false, released: false });
}

/** This runs network IO only if an authorized SERVER caller explicitly invokes it. */
export async function executeMausbotNativeRead(config, name, input = {}, deps = {}) {
  const plan = planMausbotNativeRead(name, input);
  const fetcher = (p) => mausbotRequest(config, p, deps);
  if ("botId" in input) {
    // Check that the host session can see this bot before reading sensitive metadata.
    const bots = await fetcher("/api/bots?messages=0");
    ensureBotExists(rec(bots), input.botId);
  }
  const payload = rec(await fetcher(plan.path));
  const meta = { primitive: name, mode: "metadata-only", untrusted: true };
  switch (name) {
    case "memory.bot.inspect": {
      const idx = rec(payload.index);
      return { ...meta, botId: input.botId, index: {
        lines: int(idx.lines), bytes: int(idx.bytes), loadedLines: int(idx.loadedLines),
        loadedBytes: int(idx.loadedBytes), truncated: yes(idx.truncated),
        hash: str(idx.hash, 64),
      }, topics: arr(payload.topics).slice(0, 200).map(projectFile),
        logs: arr(payload.logs).slice(0, 200).map(projectFile) };
    }
    case "memory.bot.read-file": {
      return { ...meta, botId: input.botId, path: input.path, exists: yes(payload.exists),
        hash: str(payload.hash, 64), bytes: typeof payload.text === "string"
          ? Buffer.byteLength(payload.text, "utf8") : null };
    }
    case "memory.bot.journal":
      return { ...meta, botId: input.botId,
        entries: arr(payload.entries).slice(0, input.limit ?? 50).map(projectMemo) };
    case "memory.bot.upkeep-status":
      return { ...meta, botId: input.botId, enabled: yes(payload.enabled),
        status: str(payload.status, 60), active: yes(payload.active),
        lastRunAt: int(payload.lastRunAt) };
    case "skills.bot.list":
      return { ...meta, botId: input.botId, skills: arr(payload.skills).slice(0, 200).map(projectSkill),
        stagedCount: Array.isArray(payload.staged) ? payload.staged.length : 0,
        assignedSkills: values(payload.assignedSkills, 200, 80) };
    case "skills.bot.read":
      return { ...meta, botId: input.botId, skillId: input.skillId,
        exists: typeof payload.text === "string",
        bytes: typeof payload.text === "string" ? Buffer.byteLength(payload.text, "utf8") : null };
    case "skills.library.list":
      return { ...meta, skills: arr(payload.skills).slice(0, 500).map(projectSkill) };
    case "skills.library.read":
      return { ...meta, skillId: input.skillId, exists: typeof payload.text === "string",
        bytes: typeof payload.text === "string" ? Buffer.byteLength(payload.text, "utf8") : null };
    case "memory.team.list":
      return { ...meta, section: input.section, entries: arr(payload.entries).slice(0, 200).map((v) => {
        const e = rec(v); return { id: str(e.id), status: str(e.status, 40), kind: str(e.kind, 40),
          revision: str(e.revision, 120), pinned: yes(e.pinned) };
      }), loadedIds: values(payload.loadedIds, 200, 120) };
    case "memory.section.get":
      return { ...meta, section: input.section, exists: true,
        updatedAt: int(payload.updatedAt), maxBytes: int(payload.maxBytes),
        bytes: typeof payload.text === "string" ? Buffer.byteLength(payload.text, "utf8") : null };
    case "skills.organization.list":
      return { ...meta, skills: arr(payload.skills).slice(0, 500).map(projectSkill) };
    default:
      throw new NativePrimitiveInputError("NATIVE_READ_NOT_SUPPORTED");
  }
}
