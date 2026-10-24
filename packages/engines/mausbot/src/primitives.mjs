import { randomUUID } from "node:crypto";
import { mausbotRequest, MausbotAdapterError } from "./adapter.mjs";
import { PrimitiveInputError, validateMausbotPrimitive } from "../../../engine-core/src/primitives.mjs";

const records = (value) => Array.isArray(value) ? value.filter((entry) => entry && typeof entry === "object" && !Array.isArray(entry)) : [];
const rec = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const id = (value) => encodeURIComponent(value);
const fail = (code, status = 502) => { throw new MausbotAdapterError(code, status); };
const expect = (value, code = "MAUSBOT_RESPONSE_INVALID") => {
  if (!rec(value)) fail(code);
  return value;
};
const projection = (item, allowed) => Object.fromEntries(allowed
  .filter((key) => item?.[key] !== undefined)
  .map((key) => [key, item[key]]));
const safeModel = (instance) => ({
  ...projection(instance, ["instanceId", "driverKind", "displayName", "models", "capabilities", "access"]),
  snapshot: { state: instance.snapshot?.state ?? null },
});
const safeTask = (task, active) => ({
  ...projection(task, ["threadId", "title", "createdAt", "busy", "activity", "working", "modelSelection"]),
  ...(typeof active === "string" ? { active: task.threadId === active } : {}),
});
const safeBot = (bot) => ({
  ...projection(bot, ["id", "name", "title", "description", "section", "chiefOfStaff", "modelSelection",
    "busy", "waitingForTeammates", "activity", "unread"]),
  activeTaskId: bot.threadId, tasks: records(bot.tasks).map((task) => safeTask(task, bot.threadId)),
});
const safeChannel = (channel) => ({
  ...projection(channel, ["id", "name", "memberIds", "bulletin", "defaultResponder", "section", "working", "busyBotId"]),
  activeTaskId: channel.threadId, tasks: records(channel.tasks).map((task) => safeTask(task, channel.threadId)),
});
/**
 * Defensive allowlist: never relay raw message objects, screenshots, credential cards,
 * embedded scripts, auth grants, provider request payloads, or raw app widget data.
 */
const safeMessage = (message) => ({
  ...projection(message, ["id", "at", "role", "kind", "text", "from", "replyToId", "steered", "queued"]),
  ...(message.kind === "screen" ? { hasImage: Boolean(message.hasImage || message.png) } : {}),
  ...(rec(message.tool) ? { tool: projection(message.tool, ["name", "ok", "spoken", "setup", "terminal"]) } : {}),
  ...(rec(message.card) ? { card: projection(message.card, ["title", "subtitle", "answered", "dismissed", "expired"]) } : {}),
});
const matchesTask = (owner, threadId) => owner.threadId === threadId ||
  records(owner.tasks).some((task) => task.threadId === threadId);
const isBusy = (target, threadId) => {
  const task = records(target.tasks).find((t) => t.threadId === threadId);
  return task ? Boolean(task.busy || task.working || ["running", "working"].includes(task.activity)) :
    target.threadId === threadId && Boolean(target.busy || target.working);
};
const busyChannelWith = (groups, botId) => records(groups).some((g) =>
  g.busyBotId === botId || records(g.tasks).some((t) => t.busyBotId === botId));
function targetRoute(kind, targetId) {
  return kind === "bot" ? "/api/bots/" + id(targetId) : "/api/groups/" + id(targetId);
}
function normalizeResponder(value) {
  if (!value) return undefined;
  return value.kind === "member" ? { kind: "member", botId: value.bot_id } : { kind: value.kind };
}
function ensureOwned(state, targetType, targetId, taskId) {
  const candidates = targetType === "bot" ? records(state.bots) : records(state.groups);
  const found = candidates.find((row) => row.id === targetId);
  if (!found) throw new PrimitiveInputError("PRIMITIVE_TARGET_NOT_FOUND");
  const owned = taskId ?? found.threadId;
  if (typeof owned !== "string" || !matchesTask(found, owned)) {
    throw new PrimitiveInputError("PRIMITIVE_THREAD_NOT_OWNED");
  }
  return { found, taskId: owned };
}
async function offeredSelection(fetcher, args) {
  const data = await fetcher("/api/instances");
  const inst = records(data.instances).find((item) => item.instanceId === args.instance_id);
  if (!inst || inst.snapshot?.state !== "available") throw new PrimitiveInputError("PRIMITIVE_MODEL_UNAVAILABLE");
  const models = rec(inst.models) ? inst.models : {};
  const ids = records(models.options).map((option) => option.id).filter((v) => typeof v === "string");
  if (models.default !== args.model && !ids.includes(args.model)) throw new PrimitiveInputError("PRIMITIVE_MODEL_NOT_OFFERED");
  if (args.effort !== undefined && !inst.capabilities?.effortLevels?.includes(args.effort)) {
    throw new PrimitiveInputError("PRIMITIVE_EFFORT_NOT_OFFERED");
  }
  return { instanceId: args.instance_id, model: args.model, ...(args.effort ? { effort: args.effort } : {}) };
}
function sendReceipt(value) {
  const message = rec(value?.message) ? value.message : {};
  return {
    accepted: true,
    ...(typeof message.id === "string" ? { messageId: message.id, at: message.at } : {}),
    ...(value?.queued === true ? { queued: true, queueId: value.queueId } : {}),
    ...(value?.steered === true ? { steered: true } : {}),
  };
}

/**
 * Source-mapped HTTP implementation of the 20 tools documented by OpenMausBot MCP.
 * The HTTP adapter runs only after caller authorization by ATLAS. Protocol policy:
 * - no unknown primitive, no unknown fields;
 * - no "Full" approval selection, credentials or computer actions;
 * - no task mutations across targets;
 * - send_id is stable when provided; ATLAS must persist it before retrying;
 * - waiting is a single bounded serverless job read, not the MCP 120s wait.
 */
export async function executeMausbotPrimitive(config, primitiveId, input = {}, deps = {}) {
  const { args } = validateMausbotPrimitive(primitiveId, input);
  const fetcher = async (path, options = {}) => mausbotRequest(config, path, { ...deps, ...options });
  const fleet = () => fetcher("/api/bots?messages=0");
  const method = (verb, body) => ({ method: verb, body });
  const targetFor = async (type, targetId, taskId) => ensureOwned(await fleet(), type, targetId, taskId);
  const messages = async (type, targetId, taskId, limit) => {
    const target = await targetFor(type, targetId, taskId);
    const page = expect(await fetcher("/api/threads/" + id(target.taskId) + "/messages?limit=" + (limit ?? 30)));
    return {
      target: type === "bot" ? safeBot(target.found) : safeChannel(target.found),
      taskId: target.taskId, messages: records(page.messages).map(safeMessage), hasMore: Boolean(page.hasMore),
    };
  };
  const send = async (type, targetId, taskId, text, sendId) => {
    const state = await fleet();
    const target = ensureOwned(state, type, targetId, taskId);
    if (type === "bot" && busyChannelWith(state.groups, targetId)) {
      throw new PrimitiveInputError("PRIMITIVE_BOT_BUSY_IN_CHANNEL");
    }
    if (type === "channel" && target.found.threadId !== target.taskId &&
      !records(target.found.tasks).some((t) => typeof t.working === "boolean")) {
      throw new PrimitiveInputError("PRIMITIVE_CHANNEL_TASK_NOT_ACTIVE");
    }
    const receipt = await fetcher(targetRoute(type, targetId) + "/messages",
      method("POST", { text: text.trim(), threadId: target.taskId, sendId: sendId ?? randomUUID().replace(/-/g, "") }));
    return { targetType: type, targetId, taskId: target.taskId, ...sendReceipt(receipt) };
  };

  switch (primitiveId) {
    case "system.health": {
      const res = await fetcher("/api/health");
      if (res?.app !== "openmausbot") fail("MAUSBOT_IDENTITY_MISMATCH");
      return { connected: true, app: "openmausbot" };
    }
    case "agents.list": return { agents: records((await fleet()).bots).map(safeBot) };
    case "channels.list": return { channels: records((await fleet()).groups).map(safeChannel) };
    case "conversations.messages.list": return messages("bot", args.bot_id, args.task_id, args.limit);
    case "channels.messages.list": return messages("channel", args.channel_id, args.task_id, args.limit);
    case "conversations.messages.send": return send("bot", args.bot_id, args.task_id, args.text, args.send_id);
    case "channels.messages.send": return send("channel", args.channel_id, args.task_id, args.text, args.send_id);
    case "agents.create": {
      const selection = args.instance_id ? await offeredSelection(fetcher, args) : undefined;
      const res = await fetcher("/api/bots", method("POST", {
        name: args.name.trim(), ...projection(args, ["title", "description", "section"]),
        ...(selection ? { modelSelection: selection, requireAvailableModel: true } : {}),
      }));
      if (typeof res?.bot?.id !== "string") fail();
      return { agent: safeBot(res.bot) };
    }
    case "agents.update": {
      const patch = projection(args, ["name", "title", "description", "section"]);
      const res = await fetcher("/api/bots/" + id(args.bot_id), method("PATCH", patch));
      if (!rec(res?.bot)) fail();
      return { agent: safeBot(res.bot) };
    }
    case "channels.create": {
      const result = await fetcher("/api/groups", method("POST", {
        name: args.name.trim(), memberIds: args.member_ids,
        ...(args.section !== undefined ? { section: args.section } : {}),
        setup: {
          bulletin: args.bulletin ?? "",
          defaultResponder: normalizeResponder(args.default_responder) ?? { kind: "member", botId: args.member_ids[0] },
        },
      }));
      if (typeof result?.group?.id !== "string") fail();
      return { channel: safeChannel(result.group) };
    }
    case "channels.update": {
      const patch = projection(args, ["name", "section", "bulletin"]);
      if (args.member_ids) patch.memberIds = args.member_ids;
      if (args.default_responder) patch.defaultResponder = normalizeResponder(args.default_responder);
      const result = await fetcher("/api/groups/" + id(args.channel_id), method("PATCH", patch));
      if (!rec(result?.group)) fail();
      return { channel: safeChannel(result.group) };
    }
    case "tasks.create": {
      // Refuse Full approval; for bot tasks the safe default is explicitly "ask".
      const type = args.target_type, targetId = args.target_id;
      const root = targetRoute(type, targetId) + "/tasks";
      const result = await fetcher(root, method("POST", {
        ...(args.title ? { title: args.title.trim() } : {}),
        ...(type === "bot" ? { approvalMode: "ask" } : {}),
      }));
      if (typeof result?.task?.threadId !== "string") fail();
      return { targetType: type, targetId, task: safeTask(result.task, result.bot?.threadId ?? result.group?.threadId) };
    }
    case "tasks.activate": {
      await targetFor(args.target_type, args.target_id, args.task_id);
      const target = targetRoute(args.target_type, args.target_id);
      const result = await fetcher(target + "/tasks/" + id(args.task_id) + "?messages=0", method("POST", {}));
      return { targetType: args.target_type, targetId: args.target_id, taskId: args.task_id,
        ...(rec(result?.bot) ? { agent: safeBot(result.bot) } : {}),
        ...(rec(result?.group) ? { channel: safeChannel(result.group) } : {}) };
    }
    case "tasks.rename": {
      await targetFor(args.target_type, args.target_id, args.task_id);
      const result = await fetcher(targetRoute(args.target_type, args.target_id) + "/tasks/" + id(args.task_id),
        method("PATCH", { title: args.title.trim() }));
      if (!rec(result?.task)) fail();
      return { targetType: args.target_type, targetId: args.target_id, task: safeTask(result.task) };
    }
    case "search.messages": {
      const query = new URLSearchParams({ q: args.query.trim(), limit: String(args.limit ?? 40) });
      if (args.task_id) {
        // Without a known owner, transcript searches require a separate tenancy audit.
        // ATLAS's per-instance isolation still applies; no cross-instance search.
        query.set("threadId", args.task_id);
      }
      const result = await fetcher("/api/search?" + query);
      // Search hit includes text, but not arbitrary metadata that could contain tokens/screenshots.
      return { hits: records(result?.hits).slice(0, args.limit ?? 40).map((hit) =>
        projection(hit, ["id", "threadId", "botId", "groupId", "text", "at", "role", "kind", "snippet"])) };
    }
    case "models.list": {
      const res = await fetcher("/api/instances");
      return { instances: records(res?.instances).map(safeModel) };
    }
    case "models.set": {
      const state = await fleet();
      const { found: bot } = ensureOwned(state, "bot", args.bot_id, args.task_id);
      if (isBusy(bot, args.task_id ?? bot.threadId)) throw new PrimitiveInputError("PRIMITIVE_BUSY");
      const selection = await offeredSelection(fetcher, args);
      const route = args.task_id
        ? "/api/bots/" + id(args.bot_id) + "/tasks/" + id(args.task_id)
        : "/api/bots/" + id(args.bot_id);
      const result = await fetcher(route, method("PATCH", { modelSelection: selection, requireAvailableModel: true }));
      return args.task_id
        ? { task: safeTask(expect(result?.task)) } : { agent: safeBot(expect(result?.bot)) };
    }
    case "conversations.messages.edit": {
      const { found: bot, taskId } = await targetFor("bot", args.bot_id, args.task_id);
      if (isBusy(bot, taskId)) throw new PrimitiveInputError("PRIMITIVE_BUSY");
      const result = await fetcher("/api/bots/" + id(args.bot_id) + "/messages/" + id(args.message_id) + "/edit",
        method("POST", { text: args.text.trim(), ...(args.task_id ? { threadId: taskId } : {}) }));
      return { edited: true, botId: args.bot_id,
        ...(rec(result?.message) ? { message: safeMessage(result.message) } : {}) };
    }
    case "jobs.interrupt": {
      const type = args.target_type, targetId = args.target_id;
      const state = await fleet();
      const { found, taskId } = ensureOwned(state, type, targetId, args.task_id);
      if (type === "bot" && found.threadId === taskId && busyChannelWith(state.groups, targetId)) {
        throw new PrimitiveInputError("PRIMITIVE_BOT_BUSY_IN_CHANNEL");
      }
      await fetcher(targetRoute(type, targetId) + "/interrupt", method("POST", { threadId: taskId }));
      return { interrupted: true, targetType: type, targetId, taskId };
    }
    case "jobs.wait": {
      // One bounded serverless long-poll (<=25s), never block a Vercel function for 120s.
      const { taskId } = await targetFor(args.target_type, args.target_id, args.task_id);
      const params = new URLSearchParams({ scope: args.scope ?? "job",
        wait: String(Math.min(24000, (args.timeout_seconds ?? 24) * 1000)) });
      if (args.since_ms !== undefined) params.set("since", String(args.since_ms));
      if (args.after_version !== undefined) params.set("version", args.after_version);
      const result = expect(await fetcher("/api/threads/" + id(taskId) + "/job?" + params, { timeoutMs: 26000 }));
      return { taskId, targetType: args.target_type, targetId: args.target_id,
        state: typeof result.state === "string" ? result.state : null,
        version: typeof result.version === "string" || typeof result.version === "number" ? result.version : null,
        conversation: rec(result.conversation) ?
          projection(result.conversation, ["status", "activity", "state"]) : null,
        // Job graphs and assignee metadata have no security review yet: omit raw graph.
        note: "One bounded snapshot; no completion claim is implied by HTTP 200." };
    }
    default: throw new PrimitiveInputError("PRIMITIVE_NOT_SUPPORTED");
  }
}
