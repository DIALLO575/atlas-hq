import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../src/", import.meta.url));
const forbidden = [
  { rule: /(?:from\s*["']|import\s*\(["'])[^"']*(?:demo-data|mock-data|fake-data)["']/i, reason: "import of demo/mock data" },
  { rule: /\b(?:demoApps|searchableItems|sampleQuestions|DemoNotice)\b/, reason: "hard-coded demo catalog or canned Chief questions" },
  { rule: /\b(?:fakeMissions|mockMissions|demoMissions|demoAgents|mockAgents)\s*=/i, reason: "fictional operational dataset" },
];
async function sourceFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const out = [];
  for (const entry of entries) {
    if (entry.name === "__tests__" || entry.name === "__fixtures__") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await sourceFiles(full));
    else if (/\.(?:ts|tsx|js|jsx|mjs|mts)$/.test(entry.name)) out.push(full);
  }
  return out;
}

test("B0: production source may not reintroduce demo imports or canned Chief questions", async () => {
  const files = await sourceFiles(root);
  assert.ok(files.length > 0, "source scan must never silently scan zero files");
  const offenders = [];
  for (const file of files) {
    const content = await readFile(file, "utf8");
    for (const check of forbidden) {
      if (check.rule.test(content)) offenders.push(path.relative(root, file) + ": " + check.reason);
    }
  }
  assert.deepEqual(offenders, [], "Remove the source of fictional content, not the detector");
});

test("B0: /search reads authenticated workspace missions, never a catalog of examples", async () => {
  const page = await readFile(path.join(root, "app/search/page.tsx"), "utf8");
  assert.match(page, /readAtlasWorkflow\(params\.workspaceId\)/);
  assert.match(page, /data\.missions\.filter/);
  assert.match(page, /data\.selected/);
  assert.doesNotMatch(page, /demo-data|searchableItems|DemoNotice/);
});
