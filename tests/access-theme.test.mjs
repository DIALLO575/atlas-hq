import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("access screens default to the current dark Duo and add the globals.css light palette", async () => {
  const [page, duo, css, globals, actions] = await Promise.all([
    read("../src/app/login/page.tsx"),
    read("../src/app/login/duo-auth.tsx"),
    read("../src/app/login/duo.css"),
    read("../src/app/globals.css"),
    read("../src/app/login/actions.ts"),
  ]);

  assert.match(globals, /--canvas:#f6f8fb/);
  assert.match(globals, /--surface:#fff/);
  assert.match(globals, /--ink:#1e293b/);
  assert.match(globals, /--muted:#758196/);
  assert.match(globals, /--line:#e5e9ef/);
  assert.match(page, /atlas-access-theme/);
  assert.match(page, /value === "light" \? "light" : "dark"/);
  assert.match(page, /data-theme=\{theme\}/);
  assert.match(duo, />Clair</);
  assert.match(duo, />Sombre</);
  assert.match(duo, /atlas-access-theme/);
  assert.match(duo, /action=\{signIn\}/);
  assert.match(duo, /action=\{signUp\}/);
  assert.match(duo, /Le choix d’un nouveau mot de passe n’est pas disponible sur cet écran\./);
  assert.match(duo, /aria-disabled=\{true\}/);
  assert.match(duo, /disabled/);
  assert.doesNotMatch(duo, /requestPasswordReset/);
  assert.doesNotMatch(actions, /resetPasswordForEmail/);

  const lightAt = css.indexOf('[data-theme="light"]');
  assert.ok(lightAt > 0);
  const darkCss = css.slice(0, lightAt);
  const lightCss = css.slice(lightAt);
  assert.match(darkCss, /#070b16/);
  assert.match(darkCss, /\.duo-stage\[data-panel="login"\] \.is-signup/);
  assert.match(darkCss, /\.duo-stage\[data-panel="reset"\] \.is-signup/);
  assert.match(darkCss, /\.duo-stage\[data-panel="signup"\] \.is-login/);
  assert.match(darkCss, /display: none/);
  assert.match(darkCss, /#4c94ff 0%, #1d6ef5 100%/);
  assert.match(darkCss, /\.duo-logo span \{ color: #60a5fa; \}/);
  for (const color of ["#f6f8fb", "#fff", "#1e293b", "#758196", "#e5e9ef"]) {
    assert.match(lightCss, new RegExp(color.replaceAll("#", "\\#")));
  }
  assert.doesNotMatch(lightCss, /#070b16/);
  assert.doesNotMatch(lightCss, /\.duo-submit \{/);
});
