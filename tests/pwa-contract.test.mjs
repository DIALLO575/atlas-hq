import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const manifest = JSON.parse(await readFile(new URL("../public/manifest.webmanifest", import.meta.url), "utf8"));
const serviceWorker = await readFile(new URL("../public/sw.js", import.meta.url), "utf8");

test("PWA manifest describes a standalone French app", () => {
  assert.equal(manifest.lang, "fr");
  assert.equal(manifest.start_url, "/");
  assert.equal(manifest.scope, "/");
  assert.equal(manifest.display, "standalone");
  assert.ok(manifest.icons.some((icon) => icon.src === "/icon.svg"));
});

test("service worker precaches only public assets and never caches authenticated HTML", () => {
  assert.match(serviceWorker, /cache\.addAll\(APP_SHELL\)/);
  assert.match(serviceWorker, /request\.mode === "navigate"/);
  assert.match(serviceWorker, /Never cache authenticated HTML/);
  assert.doesNotMatch(serviceWorker, /cache\.put\("\/"/);
  assert.doesNotMatch(serviceWorker, /caches\.match\("\/"\)/);
});
