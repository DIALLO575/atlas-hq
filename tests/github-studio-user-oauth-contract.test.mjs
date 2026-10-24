import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
const read=(p)=>readFile(new URL(p,import.meta.url),"utf8");

test("sandbox OAuth start uses same-site secured PKCE cookie and database state barrier",async()=>{
 const s=await read("../src/app/api/apps/github/studio/oauth/start/route.ts");
 assert.match(s,/VERCEL_ENV !== "preview"/);
 assert.match(s,/ATLAS_GITHUB_STUDIO_OAUTH_ENABLED !== "sandbox"/);
 assert.match(s,/registerConnectAttempt/);
 assert.match(s,/stage: "oauth"/);
 assert.match(s,/createStudioOAuthAttempt/);
 assert.match(s,/requireWorkspaceAdmin/);
 assert.match(s,/\.eq\("status", "repositories-ready"\)/);
 assert.match(s,/httpOnly: true, secure: true/);
 assert.match(s,/sameSite: "lax"/);
 assert.doesNotMatch(s,/console\.|NEXT_PUBLIC_.*SECRET/);
});
test("callback consumes state once, matches Supabase actor, then verifies current Github user",async()=>{
 const s=await read("../src/app/api/apps/github/studio/oauth/callback/route.ts");
 assert.match(s,/consumeConnectAttempt/);
 assert.match(s,/actor\.userId !== attempt\.actorId/);
 assert.match(s,/exchangeStudioOAuthCode/);
 assert.match(s,/verifyStudioOAuthAccount/);
 assert.match(s,/sealStudioUserGrant/);
 assert.match(s,/httpOnly: true, sameSite: "strict", secure: true/);
 assert.match(s,/studioOAuthAttemptCookie, ""/);
 assert.doesNotMatch(s,/console\.|return.*accessToken/);
});
test("execution obtains token only from encrypted HttpOnly cookie and still requires confirmation",async()=>{
 const s=await read("../src/app/api/apps/github/studio/repositories/execute/route.ts");
 assert.match(s,/readStudioUserGrant/);
 assert.match(s,/request\.cookies\.get\(studioOAuthGrantCookie\)/);
 assert.match(s,/userAccessToken: grant\.accessToken/);
 assert.match(s,/confirmed !== true/);
 assert.match(s,/VERCEL_ENV !== "preview"/);
 const wizard=await read("../src/components/github-studio-repository-wizard.tsx");
 assert.doesNotMatch(wizard,/repositories\/execute/);
});
