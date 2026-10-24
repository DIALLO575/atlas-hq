import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(path, import.meta.url), "utf8");

test("GitHub read endpoint logs only safe diagnostic codes, never secrets or provider bodies", async () => {
  const [route, ui] = await Promise.all([
    read("../src/app/api/apps/github/route.ts"),
    read("../src/components/github-control-center.tsx"),
  ]);
  assert.match(route, /let stage: "installation-token" \| "repositories"/);
  assert.match(route, /stage = "repositories"/);
  assert.match(route, /stage = "pulls"/);
  assert.match(route, /ATLAS_GITHUB_READ_FAILURE/);
  assert.match(route, /error instanceof GitHubReadError \? error\.code : "UNEXPECTED_FAILURE"/);
  assert.doesNotMatch(route, /console\.(warn|log|error)\([^\n]*(access_token|clientSecret|privateKey|request\.headers)/);
  for (const code of ["NOT_CONFIGURED", "GITHUB_REJECTED", "PROVIDER_UNAVAILABLE",
    "INVALID_RESPONSE", "INVALID_INPUT", "INCOMPLETE"]) {
    assert.match(ui, new RegExp(code + ":"));
  }
  assert.match(ui, /GITHUB_APP_PRIVATE_KEY/);
  assert.match(ui, /GitHub a refusé/);
});
