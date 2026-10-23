import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { emailConfirmRedirect, requestOriginFrom, safeInternalPath } from "../src/lib/auth/email-redirect.ts";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("emailRedirectTo allows only localhost and atlas-hq-preview and refuses every other origin", () => {
  assert.equal(emailConfirmRedirect("http://localhost:3000"), "http://localhost:3000/auth/callback");
  assert.equal(
    emailConfirmRedirect("https://atlas-hq-preview.vercel.app"),
    "https://atlas-hq-preview.vercel.app/auth/callback",
  );

  const refused = [
    "",
    "http://localhost:3001",
    "https://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:3000/",
    "http://localhost:3000/auth/callback",
    "http://localhost:3000.evil.test",
    "http://evil.test",
    "https://evil.test",
    "https://atlas-hq-preview.vercel.app/",
    "https://atlas-hq-preview.vercel.app/auth/callback",
    "https://atlas-hq-preview.vercel.app.evil.test",
    "http://atlas-hq-preview.vercel.app",
    "https://user:pass@atlas-hq-preview.vercel.app",
    "http://localhost:3000@evil.test",
    "https://ATLAS-HQ-PREVIEW.vercel.app",
    "https://atlas-hq-preview.vercel.app ",
  ];
  for (const origin of refused) assert.equal(emailConfirmRedirect(origin), null, origin);

  assert.equal(
    emailConfirmRedirect(requestOriginFrom(new Headers({ origin: "http://localhost:3000" }))),
    "http://localhost:3000/auth/callback",
  );
  assert.equal(
    emailConfirmRedirect(requestOriginFrom(new Headers({ host: "atlas-hq-preview.vercel.app", "x-forwarded-proto": "https" }))),
    "https://atlas-hq-preview.vercel.app/auth/callback",
  );
  assert.equal(
    emailConfirmRedirect(requestOriginFrom(new Headers({
      origin: "https://evil.test",
      host: "localhost:3000",
      "x-forwarded-proto": "http",
    }))),
    null,
  );
  assert.equal(
    emailConfirmRedirect(requestOriginFrom(new Headers({ host: "evil.test", "x-forwarded-proto": "https" }))),
    null,
  );
});

test("auth callback exchanges the code and opens only a safe internal path", async () => {
  const route = await read("../src/app/auth/callback/route.ts");
  const actions = await read("../src/app/login/actions.ts");
  const proxy = await read("../src/lib/supabase/proxy.ts");
  assert.match(route, /exchangeCodeForSession/);
  assert.match(route, /safeInternalPath/);
  assert.match(actions, /emailConfirmRedirect\(requestOriginFrom/);
  assert.match(actions, /emailRedirectTo/);
  assert.match(proxy, /pathname === "\/auth\/callback"/);
  assert.doesNotMatch(`${route}\n${actions}`, /service_role|sb_secret|SUPABASE_SERVICE_ROLE|resetPasswordForEmail/i);
  assert.match(actions, /signInWithPassword/);
  assert.match(actions, /auth\.signOut\(\)/);

  const signIn = actions.slice(actions.indexOf("export async function signIn"), actions.indexOf("export async function signUp"));
  assert.match(signIn, /signInWithPassword/);
  assert.doesNotMatch(signIn, /emailRedirectTo|emailConfirmRedirect/);
  const reset = actions.slice(actions.indexOf("export async function requestPasswordReset"), actions.indexOf("export async function signOut"));
  assert.doesNotMatch(reset, /supabase|resetPasswordForEmail|emailRedirectTo/);

  const inputs = ["/", "/workspaces", "/missions?x=1", "/login", "/login/", "/login?x=1", "/foo/../login", "//evil.com", "/\\evil.com", "https://evil.com", "", "/\t/evil", "http://localhost:3000/workspaces"];
  for (const base of ["http://localhost:3000/auth/callback?code=secret", "https://atlas-hq-preview.vercel.app/auth/callback?code=secret"]) {
    const origin = new URL(base).origin;
    for (const input of inputs) {
      const dest = safeInternalPath(input);
      assert.equal(dest.startsWith("/"), true, input);
      assert.equal(dest.startsWith("//"), false, input);
      const url = new URL(dest, base);
      assert.equal(url.origin, origin, `${base} ${input}`);
      assert.notEqual(url.pathname, "/login", input);
      assert.equal(url.searchParams.get("code"), null, input);
    }
  }
  assert.equal(safeInternalPath("/workspaces"), "/workspaces");
  assert.equal(safeInternalPath("/"), "/");
  assert.equal(safeInternalPath("/login"), "/");
  assert.equal(safeInternalPath("//evil.com"), "/");
});
