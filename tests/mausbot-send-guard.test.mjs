import test from "node:test";
import assert from "node:assert/strict";
import { createMausbotSendGuard, isMausbotBotActive, mausbotSendKillSwitchActive, mausbotSendTarget } from "../packages/engines/mausbot/src/send-guard.mjs";

// Fictional fixture fleet (no real bot ids).
const fleet = (active = []) => ({
  agents: [
    { id: "chief-fake-1", chiefOfStaff: true, busy: active.includes("chief-fake-1") },
    { id: "member-fake-a", busy: active.includes("member-fake-a") },
    { id: "member-fake-b", activity: active.includes("member-fake-b") ? "running" : "idle" },
    { id: "member-fake-c" },
  ],
  channels: [{ id: "chan-fake", memberIds: ["member-fake-a", "member-fake-c"], defaultResponder: { kind: "member", botId: "member-fake-c" } }],
});
const clock = () => { let t = 1_000_000; return { now: () => t, tick: (ms) => { t += ms; } }; };
const bot = (id, extra = {}) => ({ primitive: "conversations.messages.send", args: { bot_id: id, text: "x", ...extra } });

test("kill switch returns 423 and is off by default", () => {
  assert.equal(mausbotSendKillSwitchActive({}), false);
  assert.equal(mausbotSendKillSwitchActive({ ATLAS_MAUSBOT_SEND_KILL_SWITCH: "true" }), true);
  const g = createMausbotSendGuard();
  const d = g.reserve({ env: { ATLAS_MAUSBOT_SEND_KILL_SWITCH: "on" }, ...bot("member-fake-a"), fleet: fleet() });
  assert.deepEqual([d.allowed, d.status, d.code], [false, 423, "MAUSBOT_SEND_KILL_SWITCH"]);
});

test("unknown presence refuses prudently (503)", () => {
  const g = createMausbotSendGuard();
  assert.equal(g.reserve({ ...bot("member-fake-a"), fleet: null }).status, 503);
  assert.equal(g.reserve({ ...bot("member-fake-a"), fleet: { bots: [] } }).code, "MAUSBOT_SEND_PRESENCE_UNAVAILABLE");
});

test("at most 2 active bots: a third new bot is refused with Retry-After", () => {
  const c = clock();
  const g = createMausbotSendGuard({ now: c.now });
  const d = g.reserve({ ...bot("member-fake-c"), fleet: fleet(["member-fake-a", "member-fake-b"]) });
  assert.deepEqual([d.status, d.code, d.retryAfterSeconds], [429, "MAUSBOT_SEND_ACTIVE_LIMIT", 30]);
  // A bot that is already active may receive (queued) without waking a new one.
  assert.equal(g.reserve({ ...bot("member-fake-a"), fleet: fleet(["member-fake-a", "member-fake-b"]) }).allowed, true);
  // With one active bot, a second may be woken.
  c.tick(20_000);
  assert.equal(g.reserve({ ...bot("member-fake-c"), fleet: fleet(["member-fake-b"]) }).allowed, true);
});

test("60 s between two sends to the same bot", () => {
  const c = clock();
  const g = createMausbotSendGuard({ now: c.now });
  assert.equal(g.reserve({ ...bot("member-fake-a"), fleet: fleet() }).allowed, true);
  c.tick(59_000);
  const d = g.reserve({ ...bot("member-fake-a"), fleet: fleet() });
  assert.deepEqual([d.status, d.code, d.retryAfterSeconds], [429, "MAUSBOT_SEND_SAME_TARGET_COOLDOWN", 1]);
  c.tick(1_000);
  assert.equal(g.reserve({ ...bot("member-fake-a"), fleet: fleet() }).allowed, true);
});

test("20 s between two different bots", () => {
  const c = clock();
  const g = createMausbotSendGuard({ now: c.now });
  assert.equal(g.reserve({ ...bot("member-fake-a"), fleet: fleet() }).allowed, true);
  c.tick(5_000);
  const d = g.reserve({ ...bot("member-fake-b"), fleet: fleet() });
  assert.deepEqual([d.status, d.code, d.retryAfterSeconds], [429, "MAUSBOT_SEND_CROSS_TARGET_COOLDOWN", 15]);
  c.tick(15_000);
  assert.equal(g.reserve({ ...bot("member-fake-b"), fleet: fleet() }).allowed, true);
});

test("duplicate send_id or Idempotency-Key returns 409", () => {
  const c = clock();
  const g = createMausbotSendGuard({ now: c.now });
  assert.equal(g.reserve({ ...bot("member-fake-a", { send_id: "s1" }), fleet: fleet(), idempotencyKey: "k1" }).allowed, true);
  c.tick(120_000);
  assert.equal(g.reserve({ ...bot("member-fake-a", { send_id: "s1" }), fleet: fleet() }).status, 409);
  assert.equal(g.reserve({ ...bot("member-fake-a"), fleet: fleet(), idempotencyKey: "k1" }).code, "MAUSBOT_SEND_DUPLICATE");
});

test("a bot/automation-initiated send can never wake a Chief", () => {
  const g = createMausbotSendGuard();
  const d = g.reserve({ ...bot("chief-fake-1"), fleet: fleet(), initiator: { kind: "bot", botId: "member-fake-a" } });
  assert.deepEqual([d.status, d.code], [403, "MAUSBOT_BOT_TO_CHIEF_FORBIDDEN"]);
  assert.equal(g.reserve({ ...bot("chief-fake-1"), fleet: fleet(), initiator: { kind: "automation" } }).status, 403);
  // The owner may still message a chief.
  assert.equal(g.reserve({ ...bot("chief-fake-1"), fleet: fleet(), initiator: { kind: "owner" } }).allowed, true);
});

test("release() frees the slot only for definitely-rejected sends", () => {
  const c = clock();
  const g = createMausbotSendGuard({ now: c.now });
  const d = g.reserve({ ...bot("member-fake-a", { send_id: "s2" }), fleet: fleet() });
  d.release();
  assert.equal(g.reserve({ ...bot("member-fake-a", { send_id: "s2" }), fleet: fleet() }).allowed, true);
});

test("channel sends resolve the default responder and invalid targets are refused", () => {
  assert.deepEqual(mausbotSendTarget("channels.messages.send", { channel_id: "chan-fake" }, fleet()),
    { key: "channel:chan-fake", botIds: ["member-fake-c"] });
  const g = createMausbotSendGuard();
  assert.equal(g.reserve({ primitive: "conversations.messages.send", args: { bot_id: "../x" }, fleet: fleet() }).status, 400);
  assert.equal(g.reserve({ primitive: "agents.create", args: {}, fleet: fleet() }).status, 400);
  assert.equal(isMausbotBotActive({ tasks: [{ working: true }] }), true);
});
