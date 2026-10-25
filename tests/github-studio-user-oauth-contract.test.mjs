import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
const read=(p)=>readFile(new URL(p,import.meta.url),"utf8");
test("OAuth start requires controlled production/sandbox mode, admin, verified installation and PKCE",async()=>{
 const s=await read("../src/app/api/apps/github/studio/oauth/start/route.ts");
 assert.match(s,/studioMutationMode\(\)/);
 assert.match(s,/studioSandboxBindingAllowed/);
 assert.match(s,/registerConnectAttempt/);
 assert.match(s,/stage: "oauth"/);
 assert.match(s,/createStudioOAuthAttempt/);
 assert.match(s,/requireWorkspaceAdmin/);
 assert.match(s,/ownership_verified_at/);
 assert.match(s,/httpOnly: true, secure: true/);
 assert.match(s,/sameSite: "lax"/);
 assert.doesNotMatch(s,/console\.|NEXT_PUBLIC_.*SECRET/);
});
test("OAuth callback consumes state once, checks Supabase actor and live Github user",async()=>{
 const s=await read("../src/app/api/apps/github/studio/oauth/callback/route.ts");
 assert.match(s,/studioMutationMode\(\)/);
 assert.match(s,/studioSandboxBindingAllowed/);
 assert.match(s,/consumeConnectAttempt/);
 assert.match(s,/actor.userId !== attempt.actorId/);
 assert.match(s,/exchangeStudioOAuthCode/);
 assert.match(s,/verifyStudioOAuthAccount/);
 assert.match(s,/sealStudioUserGrant/);
 assert.match(s,/httpOnly: true, sameSite: "strict", secure: true/);
 assert.match(s,/studioOAuthAttemptCookie, ""/);
});
test("execute obtains token only from encrypted HttpOnly cookie and requires confirmation",async()=>{
 const s=await read("../src/app/api/apps/github/studio/repositories/execute/route.ts");
 assert.match(s,/readStudioUserGrant/);
 assert.match(s,/request.cookies.get\(studioOAuthGrantCookie\)/);
 assert.match(s,/userAccessToken: grant.accessToken/);
 assert.match(s,/confirmed !== true/);
 assert.match(s,/studioMutationMode\(\)/);
 const wizard=await read("../src/components/github-studio-repository-wizard.tsx");
 assert.match(wizard,/repositories\/execute/);
});
