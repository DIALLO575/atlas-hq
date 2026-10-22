import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");
const [proxy, login, actions, contract, selector, shell, envExample, workspacePage, sessionControls, styles] = await Promise.all([
  read("../src/lib/supabase/proxy.ts"),
  read("../src/app/login/page.tsx"),
  read("../src/app/login/actions.ts"),
  read("../src/lib/workspaces/contract.ts"),
  read("../src/components/workspace-selector.tsx"),
  read("../src/components/app-shell.tsx"),
  read("../.env.example"),
  read("../src/app/workspaces/page.tsx"),
  read("../src/components/session-controls.tsx"),
  read("../src/app/globals.css"),
]);

test("the six cockpit sections are protected by verified Supabase claims", () => {
  for (const href of ["/", "/workspaces", "/missions", "/agents", "/apps", "/inbox"]) assert.ok(shell.includes(`href: "${href}"`));
  assert.match(proxy, /supabase\.auth\.getClaims\(\)/);
  assert.match(proxy, /!isAuthenticated/);
  assert.match(proxy, /url\.pathname = "\/login"/);
});

test("login and logout use server auth actions and expose safe user messages", () => {
  assert.match(login, /role=\{reason === "credentials" \|\| reason === "invalid-input" \? "alert" : "status"\}/);
  assert.match(actions, /signInWithPassword/);
  assert.match(actions, /auth\.signOut\(\)/);
  assert.match(actions, /requestedPath\.startsWith\("\/\/"\)/);
  assert.match(login, /name="next"/);
  assert.doesNotMatch(actions, /service_role|sb_secret/i);
});

test("session controls distinguish loading, connected, signed-out, and failed states", () => {
  assert.match(sessionControls, /status: "loading"/);
  assert.match(sessionControls, /status: "ready"; email: string/);
  assert.match(sessionControls, /status: "signed-out"/);
  assert.match(sessionControls, /status: "error"/);
  assert.match(sessionControls, /Déconnecté/);
  assert.match(sessionControls, /Session indisponible/);
  assert.match(sessionControls, /disabled=\{session\.status !== "ready"\}/);
  assert.match(styles, /@media\(max-width:680px\).*\.session-row/s);
  assert.match(sessionControls, /listener\.subscription\.unsubscribe\(\)/);
});

test("workspace adapter clearly reports that the verified backend contract is missing", () => {
  assert.match(contract, /backend-contract-missing/);
  assert.match(selector, /Workspaces indisponibles/);
  assert.match(selector, /Chargement des workspaces/);
  assert.match(selector, /role="alert"/);
  assert.match(workspacePage, /Contrat workspace indisponible/);
});

test("only public Supabase settings are documented for the browser", () => {
  assert.match(envExample, /NEXT_PUBLIC_SUPABASE_URL=/);
  assert.match(envExample, /NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=/);
  const configuredKeys = envExample.split("\n").filter((line) => /^[A-Z][A-Z0-9_]*=/.test(line)).map((line) => line.split("=", 1)[0]);
  assert.deepEqual(configuredKeys, ["NEXT_PUBLIC_APP_NAME", "NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"]);
  assert.doesNotMatch(proxy + login + actions + contract + selector + shell, /SUPABASE_SERVICE_ROLE|service_role|sb_secret/i);
});
