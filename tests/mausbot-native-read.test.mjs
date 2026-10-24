import test from "node:test";
import assert from "node:assert/strict";
import { NativePrimitiveInputError, NATIVE_METADATA_READS, planMausbotNativeRead, executeMausbotNativeRead } from "../packages/engines/mausbot/src/native-read.mjs";
import { MAUSBOT_NATIVE_CAPABILITIES } from "../packages/engine-core/src/native-capabilities.mjs";
const config = { baseUrl: "https://maus.test", token: "SECRET-BEARER" };
const fixture = {
  "/api/bots": { bots: [{ id: "bot-1", name: "Bot" }, { id: "other", name: "Else" }] },
  "/api/bots/bot-1/memory": { botId: "bot-1", workspacePath: "/root/private", text: "PRIVATE MEMORY TEXT",
    index: { lines: 2, bytes: 72, loadedLines: 2, loadedBytes: 72, truncated: false, hash: "sha256ABC", secret: "KEY" },
    topics: [{ path: "memory/notes.md", name: "notes.md", bytes: 90, modifiedAt: 100, content: "SECRET" }], logs: [] },
  "/api/bots/bot-1/memory/file": { path: "MEMORY.md", text: "PRIVATE TOPIC\ncontents", hash: "testsha", exists: true },
  "/api/bots/bot-1/memory/journal": { entries: [
    { id: "entry-1", at: 120, path: "MEMORY.md", kind: "edited", actor: "bot", before: "MEMORY SECRET", diff: "PRIVATE DIFF",
      added: 1, removed: 1, canRevert: true, threadId: "private-thread" },
  ] },
  "/api/bots/bot-1/memory/upkeep": { enabled: true, status: "idle", active: false,
    lastRunAt: 111, privateConfig: "SECRET" },
  "/api/bots/bot-1/skills": { skills: [
    { name: "task-manager", description: "Tracks tasks", enabled: true, editable: false, importedAt: "2026",
      origin: "imported", warnings: ["manual review"], sha256: "a".repeat(64), executableScript: "SECRET" },
  ], staged: [{ stageId: "PRIVATE STAGED PROMPT" }], assignedSkills: ["task-manager"], credential: "SECRET" },
  "/api/bots/bot-1/skills/task-manager": { text: "---\nSECRET TOOL INSTRUCTIONS" },
  "/api/skills-library": { skills: [{ name: "review", description: "checks", enabled: false,
    source: "https://token/private", warnings: [], privateCommand: "SECRET" }] },
  "/api/skills-library/review": { text: "TOKEN IN SKILL" },
  "/api/team-memory": { section: "core", entries: [
    { id: "note-1", status: "accepted", kind: "principle", revision: "v3", detail: "TOP SECRET", key: "secret" },
  ], loadedIds: ["note-1"], privateNotes: "SECRET" },
  "/api/section-context": { section: "core", label: "Core", text: "PRIVATE SYSTEM PROMPT",
    maxBytes: 12000, updatedAt: 123, secret: "KEY" },
  "/api/org-library/skills": { organization: { secret: "KEY" },
    skills: [{ name: "org-skill", description: "review", enabled: false, warnings: [], token: "SECRET" }] },
};

function mocked(requests, override = {}) {
  return async (url, init) => {
    const addr = new URL(url);
    const body = Object.hasOwn(override, addr.pathname) ? override[addr.pathname] : fixture[addr.pathname];
    requests.push({ method: init.method, path: addr.pathname, search: addr.searchParams,
      authorization: init.headers.Authorization, redirect: init.redirect });
    return body === undefined ? Response.json({error:"no mock route"}, {status: 404}) : Response.json(body);
  };
}
const inputs = {
  "memory.bot.inspect": { botId: "bot-1" },
  "memory.bot.read-file": { botId: "bot-1", path: "MEMORY.md" },
  "memory.bot.journal": { botId: "bot-1", limit: 10 },
  "memory.bot.upkeep-status": { botId: "bot-1" },
  "skills.bot.list": { botId: "bot-1" },
  "skills.bot.read": { botId: "bot-1", skillId: "task-manager" },
  "skills.library.list": {},
  "skills.library.read": { skillId: "review" },
  "memory.team.list": { section: "core" },
  "memory.section.get": { section: "core" },
  "skills.organization.list": {},
};

test("Eleven native reads are source-mapped and disabled for live use", () => {
  assert.equal(NATIVE_METADATA_READS.length, 11);
  assert.equal(new Set(NATIVE_METADATA_READS).size, 11);
  for (const name of NATIVE_METADATA_READS) {
    const src = MAUSBOT_NATIVE_CAPABILITIES.find(x => x.id === name);
    assert.equal(src.method, "GET");
    assert.equal(src.callable, false);
    assert.equal(src.hostTested, false);
  }
});

for (const name of NATIVE_METADATA_READS) {
  test(name + " calls only source route with safe projected metadata", async () => {
    const sent = [];
    const plan = planMausbotNativeRead(name, inputs[name]);
    const output = await executeMausbotNativeRead(config, name, inputs[name], { fetchImpl: mocked(sent) });
    assert.equal(plan.method, "GET");
    assert.equal(plan.hostTested, false);
    assert.equal(plan.released, false);
    assert.equal(output.mode, "metadata-only");
    assert.equal(output.primitive, name);
    assert.ok(sent.some(x => x.path === plan.path.split("?")[0]));
    assert.ok(sent.every(x => x.method === "GET" && x.redirect === "manual" &&
      x.authorization === "Bearer SECRET-BEARER"));
    const printed = JSON.stringify(output);
    for (const x of ["SECRET", "PRIVATE", "TOKEN", "/root/", "PRIVATE DIFF", "SECRET-BEARER"]) {
      assert.equal(printed.includes(x), false, name + " leaked " + x);
    }
    if (Object.hasOwn(inputs[name], "botId")) {
      assert.equal(sent[0].path, "/api/bots");
      assert.equal(sent[0].search.get("messages"), "0");
    }
  });
}

test("Journal and section queries are bounded, correctly escaped and never include unknown parameters", () => {
  assert.equal(planMausbotNativeRead("memory.bot.journal", {botId:"bot-1",limit:200}).path,
    "/api/bots/bot-1/memory/journal?limit=200");
  assert.equal(planMausbotNativeRead("memory.team.list", {section:""}).path, "/api/team-memory?section=");
  assert.equal(planMausbotNativeRead("memory.team.list", {section:"R&D"}).path, "/api/team-memory?section=R%26D");
  assert.equal(planMausbotNativeRead("memory.bot.read-file", {botId:"bot-1",path:"memory/log/test.md"}).path,
    "/api/bots/bot-1/memory/file?path=memory%2Flog%2Ftest.md");
  assert.throws(()=>planMausbotNativeRead("memory.team.list", {section:"../../"}), NativePrimitiveInputError);
  assert.throws(()=>planMausbotNativeRead("memory.bot.read-file", {botId:"bot-1",path:"/etc/passwd"}), NativePrimitiveInputError);
  assert.throws(()=>planMausbotNativeRead("memory.bot.read-file", {botId:"bot-1",path:"memory/../../foo.md"}), NativePrimitiveInputError);
  assert.throws(()=>planMausbotNativeRead("memory.bot.journal", {botId:"bot-1",limit:201}), NativePrimitiveInputError);
  assert.throws(()=>planMausbotNativeRead("skills.bot.list", {botId:"bot-1", extra:"privilege"}), NativePrimitiveInputError);
  assert.throws(()=>planMausbotNativeRead("skills.library.read", {skillId:"../escape"}), NativePrimitiveInputError);
  assert.throws(()=>planMausbotNativeRead("memory.bot.inspect", {botId:"bogus/bot"}), NativePrimitiveInputError);
  assert.throws(()=>planMausbotNativeRead("computer.local.run", {}), NativePrimitiveInputError);
});

test("Hidden/unowned bot fails closed before any sensitive native read", async () => {
  const sent = [];
  await assert.rejects(executeMausbotNativeRead(config, "memory.bot.inspect", {botId:"outsider"},
    {fetchImpl: mocked(sent)}), (e)=>e.code==="NATIVE_BOT_NOT_VISIBLE");
  assert.equal(sent.length,1);
  assert.equal(sent[0].path,"/api/bots");
});

test("Malformed source shape fails closed; never fabricates an empty list", async () => {
  await assert.rejects(executeMausbotNativeRead(config,"skills.library.list",{},
    {fetchImpl: mocked([], {"/api/skills-library":{skills:{bad:true}}})}), (e)=>e.code==="NATIVE_RESPONSE_INVALID");
  await assert.rejects(executeMausbotNativeRead(config,"memory.bot.inspect",{botId:"bot-1"},
    {fetchImpl: mocked([], {"/api/bots/bot-1/memory":{index:null}})}), (e)=>e.code==="NATIVE_RESPONSE_INVALID");
});
