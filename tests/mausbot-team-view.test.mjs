import test from "node:test";
import assert from "node:assert/strict";
import { buildTeamView, createTeamViewCache, fetchMausbotBotDetail, fetchMausbotSectionContext, fetchMausbotTeamView,
  parsePresence, parseTeamMap, TeamViewInputError } from "../packages/engines/mausbot/src/team-view.mjs";

// Clearly fictional fixtures. Unknown fields must be ignored, never relayed.
const config = { baseUrl: "https://maus.example.test", token: "FAKE-BEARER" };
const fixture = {
  "/api/bots": { bots: [
    { id: "chief-demo", name: "Demo Chief", chiefOfStaff: true, section: "demo", avatarUrl: "/api/attachments/demo.png", secret: "NOPE" },
    { id: "worker-demo-1", name: "Worker One", section: "demo", busy: true },
    { id: "worker-demo-2", name: "Worker Two", section: "demo" },
    { id: "loner-demo", name: "Loner" },
  ] },
  "/api/team-map": { teams: [{ chiefId: "chief-demo", memberIds: ["worker-demo-1", "worker-demo-2"], extra: { x: 1 } }] },
  "/api/sidebar-sections": { sections: [{ id: "demo", label: "Équipe démo", prompt: "PRIVATE" }] },
  "/api/presence/active": { active: [{ botId: "chief-demo" }] },
  "/api/bots/chief-demo/overview": { lastMessage: { text: "Rapport fictif prêt", at: 1700000000000, raw: "x" }, openReports: 3 },
  "/api/bots/worker-demo-1/overview": { lastMessage: { text: "ok" }, openReports: [] },
  "/api/bots/worker-demo-1/activity": { events: [{ at: "2026-01-01T00:00:00Z", kind: "tool", title: "Fictional step", input: "SECRET" }] },
  "/api/section-context": { section: "demo", label: "Démo", text: "PRIVATE SYSTEM PROMPT", updatedAt: 1 },
};
function mocked(requests, missing = []) {
  return async (url, init) => {
    const addr = new URL(url);
    requests.push({ path: addr.pathname, method: init.method });
    if (missing.includes(addr.pathname) || !(addr.pathname in fixture)) return new Response("{}", { status: 404 });
    return new Response(JSON.stringify(fixture[addr.pathname]), { status: 200, headers: { "content-type": "application/json" } });
  };
}

test("team view assembles chiefs, members, status, overview; drops unknown fields", async () => {
  const requests = [];
  const view = await fetchMausbotTeamView(config, { fetchImpl: mocked(requests) });
  assert.equal(view.teams.length, 1);
  const [team] = view.teams;
  assert.equal(team.chief.id, "chief-demo");
  assert.equal(team.chief.status, "active");
  assert.equal(team.chief.hasAvatar, true);
  assert.equal(team.chief.openReports, 3);
  assert.equal(team.chief.lastMessage.text, "Rapport fictif prêt");
  assert.equal(team.sectionLabel, "Équipe démo");
  assert.deepEqual(team.members.map((m) => [m.id, m.status]), [["worker-demo-1", "active"], ["worker-demo-2", "idle"]]);
  assert.deepEqual(view.unassigned.map((m) => m.id), ["loner-demo"]);
  assert.deepEqual(view.degraded, []);
  assert.ok(!JSON.stringify(view).includes("NOPE") && !JSON.stringify(view).includes("PRIVATE"));
  assert.ok(requests.every((r) => r.method === "GET"));
});

test("missing endpoints degrade cleanly and fall back to sections", async () => {
  const requests = [];
  const view = await fetchMausbotTeamView(config, { fetchImpl: mocked(requests,
    ["/api/team-map", "/api/presence/active", "/api/sidebar-sections", "/api/bots/chief-demo/overview"]) });
  assert.deepEqual(view.degraded.sort(), ["overview", "presence", "sidebar-sections", "team-map"]);
  assert.deepEqual(view.teams[0].members.map((m) => m.id), ["worker-demo-1", "worker-demo-2"]);
  assert.equal(view.teams[0].chief.openReports, null);
});

test("bot detail validates ids, requires visibility, and projects activity", async () => {
  await assert.rejects(fetchMausbotBotDetail(config, "../etc", { fetchImpl: mocked([]) }), TeamViewInputError);
  await assert.rejects(fetchMausbotBotDetail(config, "ghost-demo", { fetchImpl: mocked([]) }), /TEAM_VIEW_BOT_NOT_VISIBLE/);
  const detail = await fetchMausbotBotDetail(config, "worker-demo-1", { fetchImpl: mocked([]) });
  assert.equal(detail.overview.openReports, 0);
  assert.deepEqual(detail.activity, [{ at: "2026-01-01T00:00:00Z", kind: "tool", title: "Fictional step" }]);
  assert.ok(!JSON.stringify(detail).includes("SECRET"));
});

test("section context never relays the private text", async () => {
  const out = await fetchMausbotSectionContext(config, "demo", { fetchImpl: mocked([]) });
  assert.equal(out.context.hasText, true);
  assert.ok(!JSON.stringify(out).includes("PRIVATE"));
  await assert.rejects(fetchMausbotSectionContext(config, "a/b", { fetchImpl: mocked([]) }), TeamViewInputError);
});

test("tolerant parsers accept alternative shapes", () => {
  assert.equal(parseTeamMap({ edges: [{ botId: "a", reportsTo: "b" }] }).get("a"), "b");
  assert.equal(parseTeamMap({ unrelated: true }), null);
  assert.deepEqual([...parsePresence({ botIds: ["x", "bad id"] })], ["x"]);
  assert.equal(buildTeamView({ bots: "nope", teamMap: null, presence: null, sections: null }).teams.length, 0);
});

test("cache serves 20 s and never hits upstream more than once per 10 s", async () => {
  let t = 0; let calls = 0;
  const cache = createTeamViewCache({ now: () => t });
  const load = async () => { calls += 1; return { n: calls }; };
  assert.equal((await cache.get("k", load)).cached, false);
  t = 15_000; assert.equal((await cache.get("k", load)).cached, true);
  t = 21_000; await cache.get("k", load); assert.equal(calls, 2);
  const failing = async () => { calls += 1; throw new Error("down"); };
  t = 0; await assert.rejects(cache.get("f", failing));
  t = 5_000; await assert.rejects(cache.get("f", failing));
  assert.equal(calls, 3);
});
