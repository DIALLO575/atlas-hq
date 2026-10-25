import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const source = readFileSync(new URL("../src/lib/notion/reader.ts", import.meta.url), "utf8");
const workspaceId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const connectionId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function reader() {
  const calls = [];
  const exports = {};
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
  } }).outputText, {
    exports,
    require(name) {
      if (name === "./connect") return {
        requireNotionWorkspaceActor: async (id) => { calls.push(id); return null; },
      };
      return {};
    },
  });
  return { load: exports.loadNotionPersonalConnection, calls };
}

test("standard Atlas workspace and connection UUIDs reach the Notion membership gate", async () => {
  for (const ids of [
    { workspaceId, connectionId },
    { workspaceId: workspaceId.toUpperCase(), connectionId: connectionId.toUpperCase() },
  ]) {
    const fixture = reader();
    await assert.rejects(fixture.load(ids), { code: "FORBIDDEN" });
    assert.deepEqual(fixture.calls, [ids.workspaceId]);
  }
});

test("malformed Notion reader IDs are rejected before membership or credential access", async () => {
  const malformed = [
    "", workspaceId.replaceAll("-", ""),
    "aaaaaaaa-aaaa-4aaa-8aaa-aaaa-aaaaaaaaaaaa",
    "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaag",
    workspaceId + "/extra",
  ];
  for (const id of malformed) {
    for (const ids of [
      { workspaceId: id, connectionId },
      { workspaceId, connectionId: id },
    ]) {
      const fixture = reader();
      await assert.rejects(fixture.load(ids), { code: "INVALID_REQUEST" });
      assert.deepEqual(fixture.calls, []);
    }
  }
});
