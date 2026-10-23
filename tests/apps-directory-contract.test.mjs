import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");
const logos = [
  "notion", "github", "linear", "slack", "google-drive", "google-calendar",
  "google-sheets", "airtable", "salesforce", "google-analytics",
  "microsoft-365", "figma",
];

test("locally bundled recognizable provider logos are valid SVGs", async () => {
  for (const slug of logos) {
    const svg = await read("../public/brands/" + slug + ".svg");
    assert.match(svg, /<svg\b/);
    assert.match(svg, /<\/svg>/);
    assert.doesNotMatch(svg, /<script\b|<foreignObject\b|<image\b|\bon\w+=/i);
  }
});

test("Apps directory shows honest integration status and interactive discovery", async () => {
  const [page, directory, catalogue, brand, home] = await Promise.all([
    read("../src/app/apps/page.tsx"),
    read("../src/components/apps-directory.tsx"),
    read("../src/lib/app-catalog.ts"),
    read("../src/components/brand-logo.tsx"),
    read("../src/app/page.tsx"),
  ]);
  assert.match(page, /<AppsDirectory/);
  assert.match(page, /<GitHubWorkspacePicker/);
  assert.match(directory, /githubSlot/);
  assert.match(directory, /app\.slug === "github"/);
  assert.match(directory, /useState/);
  assert.match(directory, /aria-pressed/);
  assert.match(directory, /Non connectée/);
  assert.match(directory, /disabled aria-label=/);
  assert.match(directory, /Les connexions ne sont pas encore disponibles/);
  assert.match(catalogue, /Google Calendar/);
  assert.match(catalogue, /Salesforce/);
  assert.match(brand, /\/brands\//);
  assert.match(brand, /unoptimized/);
  assert.match(home, /<BrandLogo/);
});
