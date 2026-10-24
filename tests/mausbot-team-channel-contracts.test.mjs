import test from "node:test";
import assert from "node:assert/strict";
import { MAUSBOT_NATIVE_CAPABILITIES, nativePrimitive } from "../packages/engine-core/src/native-capabilities.mjs";
import {
  TEAM_CHANNEL_MUTATION_PLANS, TEAM_CHANNEL_METADATA_READS, TeamChannelContractError,
  planTeamChannelMutation, planTeamCatalogRead, executeTeamCatalogRead, planTeamCliInspection,
} from "../packages/engines/mausbot/src/team-channel-contracts.mjs";

const cases = [
  ["teams.export", { name: "Launch" }, "/api/teams/export", "POST", { name: "Launch", format: "manifest" }],
  ["teams.organization.install", { packageId: "11111111-2222-4333-8444-555555555555" },
    "/api/org-library/add", "POST", { packageId: "11111111-2222-4333-8444-555555555555" }],
  ["channels.mark-read", { channelId: "group-1" }, "/api/groups/group-1/read", "POST", undefined],
  ["channels.queue.cancel", { channelId: "group-1", queueId: "queue-1" },
    "/api/groups/group-1/queue/queue-1", "DELETE", undefined],
  ["channels.queue.steer", { channelId: "group-1", queueId: "queue-1", threadId: "thread-1" },
    "/api/groups/group-1/queue/queue-1/steer", "POST", { threadId: "thread-1" }],
  ["channels.members.compact", { channelId: "group-1", memberId: "bot-1" },
    "/api/groups/group-1/members/bot-1/compact", "POST", undefined],
  ["channels.tasks.delete", { channelId: "group-1", threadIds: ["task-1", "task-2"] },
    "/api/groups/group-1/tasks/delete", "POST", { threadIds: ["task-1", "task-2"] }],
];

test("Seven source-mapped team/channel actions are offline-only, never mutation-enabled", () => {
  assert.equal(TEAM_CHANNEL_MUTATION_PLANS.length, 7);
  for (const [name, input, path, method, body] of cases) {
    assert.equal(nativePrimitive(name)?.method, method);
    const plan = planTeamChannelMutation(name, input);
    assert.equal(plan.primitive, name);
    assert.equal(plan.path, path);
    assert.equal(plan.method, method);
    assert.deepEqual(plan.body, body);
    assert.equal(plan.requiresHumanApproval, true);
    assert.equal(plan.requiresDurableAudit, true);
    assert.equal(plan.requiresWorkspaceAuthorization, true);
    assert.equal(plan.requiresRuntimeOwnershipCheck, name.startsWith("channels."));
    assert.equal(plan.retryPolicy, "never-automatic");
    assert.equal(plan.callable, false);
    assert.equal(plan.hostTested, false);
    assert.equal(plan.released, false);
  }
});
test("Exports are constrained to manifest-only; no back-up with private transcripts", () => {
  const ok = planTeamChannelMutation("teams.export", { name: "Operations" });
  assert.equal(ok.body.format, "manifest");
  assert.throws(() => planTeamChannelMutation("teams.export", { name: "X", format: "backup" }),
    TeamChannelContractError);
  assert.throws(() => planTeamChannelMutation("teams.export", { name: "X", includeMemory: true }),
    TeamChannelContractError);
  assert.throws(() => planTeamChannelMutation("teams.organization.install", { packageId: "../../../etc" }),
    TeamChannelContractError);
});
test("Channel actions reject fake approvals, path traversal, duplicate threads and missing ownership", () => {
  const bad = [
    ["channels.mark-read", { channelId: "other", approved: true }],
    ["channels.mark-read", { channelId: "../room" }],
    ["channels.queue.cancel", { channelId: "room", queueId: "foo/bar" }],
    ["channels.queue.steer", { channelId: "room", queueId: "q" }],
    ["channels.queue.steer", { channelId: "room", queueId: "q", threadId: "/etc/passwd" }],
    ["channels.members.compact", { channelId: "room", memberId: "" }],
    ["channels.tasks.delete", { channelId: "room", threadIds: [] }],
    ["channels.tasks.delete", { channelId: "room", threadIds: ["t1", "t1"] }],
    ["channels.tasks.delete", { channelId: "room", threadIds: ["../secret"] }],
    ["channels.tasks.delete", { channelId: "room", threadIds: ["t1"], force: true }],
    ["teams.import", { manifest: { format: "openmaus.team" } }],
  ];
  for (const [name, payload] of bad) {
    assert.throws(() => planTeamChannelMutation(name, payload), TeamChannelContractError, name);
  }
});
test("Two library catalog reads allow only their source paths and strip malicious response fields", async () => {
  assert.deepEqual(TEAM_CHANNEL_METADATA_READS, ["teams.library.catalog", "teams.organization.catalog"]);
  const fixtures = {
    "/api/team-library/catalog": {
      format: "openmaus.catalog", version: 1, repositoryUrl: "PRIVATE_URL",
      secretToken: "SECRET", teams: [{
        slug: "launch", name: "Launch Team", category: "ops", summary: "Public notes",
        members: 3, featured: true, requires: { apps: ["Linear"] },
        privateCredential: "SECRET", readme: "PRIVATE", manifest: "PRIVATE",
      }],
    },
    "/api/org-library": {
      format: "openmaus.org-library", version: 1,
      organization: { id: "SECRET_ORG", name: "Org" },
      packages: [{
        packageId: "11111111-2222-4333-8444-555555555555",
        name: "Launch", kind: "team", mode: "available",
        publisher: { name: "Org", secret: "SECRET" },
        release: { version: "1.0.0", notes: "PRIVATE" },
        source: "SECRET", credential: "SECRET",
      }],
    },
  };
  const seen = [];
  const fetchImpl = async (url, init) => {
    const target = new URL(url);
    seen.push({ pathname: target.pathname, init });
    return Response.json(fixtures[target.pathname]);
  };
  for (const name of TEAM_CHANNEL_METADATA_READS) {
    const plan = planTeamCatalogRead(name);
    assert.equal(plan.callable, false);
    assert.equal(plan.released, false);
    const data = await executeTeamCatalogRead({ baseUrl: "https://maus.example.test", token: "FAKE_BEARER" },
      name, { fetchImpl });
    const result = JSON.stringify(data);
    assert.ok(!result.includes("SECRET"));
    assert.ok(!result.includes("PRIVATE"));
    assert.ok(!result.includes("FAKE_BEARER"));
    assert.equal(data.untrusted, true);
    assert.equal(data.mode, "metadata-only");
    assert.ok(seen.some((s) => s.pathname === plan.path));
  }
  assert.ok(seen.every((s) => s.init.method === "GET" &&
    s.init.headers.Authorization === "Bearer FAKE_BEARER" && s.init.redirect === "manual"));
});
test("Malformed catalog responses fail closed rather than fabricating empty teams", async () => {
  const fetchImpl = async () => Response.json({ format: "unsupported", teams: [] });
  await assert.rejects(executeTeamCatalogRead({ baseUrl: "https://host.test", token: "fake" },
    "teams.library.catalog", { fetchImpl }), (e) => e.code === "TEAM_CATALOG_RESPONSE_INVALID");
  assert.throws(() => planTeamCatalogRead("teams.import"), TeamChannelContractError);
});
test("CLI supports non-mutating team inspection only, with worker-owned files and no shell", () => {
  for (const action of ["teams.dry-run", "teams.check"]) {
    const plan = planTeamCliInspection(action, { file: "/srv/atlas/teams/research.yaml" });
    assert.equal(plan.executable, "openmausbot");
    assert.equal(plan.runtime, "external-durable-worker");
    assert.equal(plan.shell, false);
    assert.equal(plan.spawnAllowedOnVercel, false);
    assert.equal(plan.mayExecuteMutations, false);
    assert.equal(plan.callable, false);
    assert.ok(plan.argv.includes(action === "teams.check" ? "--check" : "--dry-run"));
  }
  assert.throws(() => planTeamCliInspection("teams.apply", { file: "/srv/atlas/teams/a.yaml", approved: true }),
    TeamChannelContractError);
  assert.throws(() => planTeamCliInspection("teams.dry-run", { file: "/srv/atlas/teams/../bad.yaml" }));
  assert.throws(() => planTeamCliInspection("teams.check", { file: "/srv/atlas/teams/a.yaml", prune: true }));
});

test("Manifest entries stay non-callable independently of preview validation", () => {
  for (const name of [...TEAM_CHANNEL_MUTATION_PLANS, ...TEAM_CHANNEL_METADATA_READS]) {
    const spec = MAUSBOT_NATIVE_CAPABILITIES.find((x) => x.id === name);
    assert.ok(spec, name);
    assert.equal(spec.callable, false);
    assert.equal(spec.hostTested, false);
  }
});
