/**
 * MAUSBOT send dispatcher guard ("répartiteur"). Runs server-side, in front of
 * `conversations.messages.send` / `channels.messages.send` and agent dispatch,
 * BEFORE any upstream mutation. It protects the single small MAUSBOT VPS:
 *
 * - kill switch: ATLAS_MAUSBOT_SEND_KILL_SWITCH=true|1|on -> 423 (default off);
 * - at most `maxActive` (2) bots working in parallel, counted from the live
 *   MAUSBOT fleet (busy / working / activity). Unknown presence -> 503, never pass;
 * - >= 60 s between two sends to the same target, >= 20 s between two
 *   different targets (429 + Retry-After seconds);
 * - duplicate send_id / Idempotency-Key -> 409;
 * - a bot/automation-initiated send may never wake a Chief of Staff (403).
 *
 * State is checked at action time (no cron). Storage is process memory: the
 * Supabase audit table stores neither target ids nor a readable history for the
 * authenticated role, so it cannot back these windows without a new migration.
 * LIMIT: on serverless each warm instance keeps its own window; a cold start or a
 * second instance resets it. The live "max active bots" rule and the durable
 * Supabase idempotency reservation still apply in every instance.
 */
export const MAUSBOT_SEND_GUARD_DEFAULTS = Object.freeze({
  maxActive: 2, sameTargetMs: 60_000, crossTargetMs: 20_000, activeRetryMs: 30_000,
  idempotencyTtlMs: 24 * 60 * 60_000, maxEntries: 1000,
});
export const MAUSBOT_GUARDED_SEND_PRIMITIVES = Object.freeze(["conversations.messages.send", "channels.messages.send"]);

const ID = /^[A-Za-z0-9_-]{1,120}$/;
const rec = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const deny = (status, code, retryAfterMs) => ({
  allowed: false, status, code,
  ...(retryAfterMs !== undefined ? { retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / 1000)) } : {}),
});

export function mausbotSendKillSwitchActive(env = {}) {
  return ["true", "1", "on", "yes"].includes(String(env.ATLAS_MAUSBOT_SEND_KILL_SWITCH ?? "").trim().toLowerCase());
}

/** A bot counts as active when MAUSBOT reports it busy, working or running. */
export function isMausbotBotActive(bot) {
  if (!rec(bot)) return false;
  if (bot.busy === true || bot.working === true || bot.waitingForTeammates === true) return true;
  if (["running", "working", "busy"].includes(bot.activity)) return true;
  return Array.isArray(bot.tasks) && bot.tasks.some((t) => rec(t) &&
    (t.busy === true || t.working === true || ["running", "working"].includes(t.activity)));
}

/** Returns the target bot ids a send would wake, or null when unknown. */
export function mausbotSendTarget(primitive, args, fleet) {
  if (!rec(args)) return null;
  if (primitive === "conversations.messages.send") {
    return ID.test(args.bot_id ?? "") ? { key: "bot:" + args.bot_id, botIds: [args.bot_id] } : null;
  }
  if (primitive === "channels.messages.send") {
    if (!ID.test(args.channel_id ?? "")) return null;
    const channel = Array.isArray(fleet?.channels) ? fleet.channels.find((c) => rec(c) && c.id === args.channel_id) : null;
    const responder = channel?.defaultResponder;
    const botIds = responder?.kind === "member" && ID.test(responder.botId ?? responder.bot_id ?? "")
      ? [responder.botId ?? responder.bot_id]
      : Array.isArray(channel?.memberIds) ? channel.memberIds.filter((m) => typeof m === "string" && ID.test(m)) : [];
    return { key: "channel:" + args.channel_id, botIds };
  }
  return null;
}

export function createMausbotSendGuard(options = {}) {
  const cfg = { ...MAUSBOT_SEND_GUARD_DEFAULTS, ...options };
  const now = typeof options.now === "function" ? options.now : () => Date.now();
  const lastByTarget = new Map();
  let last = null; // { key, at }
  const seenKeys = new Map();

  const prune = (t) => {
    for (const [k, at] of seenKeys) if (t - at > cfg.idempotencyTtlMs) seenKeys.delete(k);
    for (const [k, at] of lastByTarget) if (t - at > cfg.sameTargetMs) lastByTarget.delete(k);
    while (seenKeys.size > cfg.maxEntries) seenKeys.delete(seenKeys.keys().next().value);
  };

  /**
   * Check AND reserve a send. `fleet` = { agents, channels } from the live
   * `agents.list` / `channels.list` primitives (or null when unavailable).
   * `initiator.kind` is "owner" (a human clicked) or "bot" / "automation".
   */
  function reserve({ env = {}, primitive, args, fleet, initiator = { kind: "owner" }, idempotencyKey } = {}) {
    if (mausbotSendKillSwitchActive(env)) return deny(423, "MAUSBOT_SEND_KILL_SWITCH");
    if (!MAUSBOT_GUARDED_SEND_PRIMITIVES.includes(primitive)) return deny(400, "MAUSBOT_SEND_PRIMITIVE_NOT_GUARDED");
    if (!rec(fleet) || !Array.isArray(fleet.agents)) return deny(503, "MAUSBOT_SEND_PRESENCE_UNAVAILABLE");
    const target = mausbotSendTarget(primitive, args, fleet);
    if (!target) return deny(400, "MAUSBOT_SEND_TARGET_INVALID");
    const t = now();
    prune(t);

    const keys = [idempotencyKey, args?.send_id].filter((k) => typeof k === "string" && k.length > 0 && k.length <= 200);
    if (keys.some((k) => seenKeys.has(k))) return deny(409, "MAUSBOT_SEND_DUPLICATE");

    const byId = new Map(fleet.agents.filter(rec).map((a) => [a.id, a]));
    if (initiator?.kind !== "owner") {
      const wakesChief = target.botIds.some((id) => byId.get(id)?.chiefOfStaff === true);
      if (wakesChief) return deny(403, "MAUSBOT_BOT_TO_CHIEF_FORBIDDEN");
      if (initiator?.botId && target.botIds.includes(initiator.botId)) return deny(403, "MAUSBOT_SELF_WAKE_FORBIDDEN");
    }

    const active = fleet.agents.filter(isMausbotBotActive).map((a) => a.id);
    const newlyWoken = target.botIds.filter((id) => !active.includes(id));
    if (newlyWoken.length > 0 && active.length + 1 > cfg.maxActive) {
      return deny(429, "MAUSBOT_SEND_ACTIVE_LIMIT", cfg.activeRetryMs);
    }

    const sameAt = lastByTarget.get(target.key);
    if (sameAt !== undefined && t - sameAt < cfg.sameTargetMs) {
      return deny(429, "MAUSBOT_SEND_SAME_TARGET_COOLDOWN", cfg.sameTargetMs - (t - sameAt));
    }
    if (last && last.key !== target.key && t - last.at < cfg.crossTargetMs) {
      return deny(429, "MAUSBOT_SEND_CROSS_TARGET_COOLDOWN", cfg.crossTargetMs - (t - last.at));
    }

    lastByTarget.set(target.key, t);
    const previous = last;
    last = { key: target.key, at: t };
    for (const k of keys) seenKeys.set(k, t);
    let released = false;
    return {
      allowed: true, status: 200, target: target.key,
      /** Call ONLY when the upstream definitely rejected the send (nothing was delivered). */
      release() {
        if (released) return;
        released = true;
        if (lastByTarget.get(target.key) === t) lastByTarget.delete(target.key);
        if (last?.at === t && last.key === target.key) last = previous;
        for (const k of keys) if (seenKeys.get(k) === t) seenKeys.delete(k);
      },
    };
  }
  return Object.freeze({ reserve, config: Object.freeze({ ...cfg, now: undefined }) });
}

/** Process-wide guard shared by all ATLAS send routes of one server instance. */
let shared = null;
export function sharedMausbotSendGuard() {
  shared ??= createMausbotSendGuard();
  return shared;
}
