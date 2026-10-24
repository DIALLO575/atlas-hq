import assert from "node:assert/strict";
import test from "node:test";
import {
 createStudioOAuthAttempt, readStudioOAuthAttempt, githubStudioAuthorizeUrl,
 exchangeStudioOAuthCode, verifyStudioOAuthAccount, sealStudioUserGrant,
 readStudioUserGrant,
} from "../packages/connectors/github/src/github-studio-user-oauth.mjs";

const workspaceId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const actorId = "11111111-1111-4111-8111-111111111111";
const now = Date.parse("2026-10-24T22:00:00Z");
const key = "unit-test-OAuth-server-cookie-encryption-key-32-chars";
const state = "signed.opaque-unique-attempt-with-server-side-db-replay-check";
const location = "https://atlas-preview.example/api/apps/github/studio/oauth/callback";
const json = (data, status = 200) => new Response(JSON.stringify(data), { status });

test("PKCE authorization URL binds an encrypted HttpOnly attempt to state and workspace", () => {
 const attempt = createStudioOAuthAttempt({
   workspaceId, actorId, installationId: 77, state, key, now,
 });
 assert.match(attempt.challenge,/^[A-Za-z0-9_-]{43}$/);
 assert.ok(!attempt.cookie.includes(state));
 assert.ok(!attempt.cookie.includes(workspaceId));
 const decoded = readStudioOAuthAttempt({cookie:attempt.cookie,state,key,now:now+500});
 assert.deepEqual(Object.keys(decoded).sort(),
   ["actorId","installationId","verifier","workspaceId"].sort());
 const url = githubStudioAuthorizeUrl({
   clientId:"Iv1.testClient",redirectUri:location,state,challenge:attempt.challenge,
 });
 assert.equal(url.origin,"https://github.com");
 assert.equal(url.pathname,"/login/oauth/authorize");
 assert.equal(url.searchParams.get("code_challenge_method"),"S256");
 assert.equal(url.searchParams.get("code_challenge"),attempt.challenge);
 assert.equal(url.searchParams.get("scope"),"offline_access");
 assert.equal(url.searchParams.get("redirect_uri"),location);
 assert.ok(!url.toString().includes(decoded.verifier));
 assert.equal(readStudioOAuthAttempt({cookie:attempt.cookie,state:"wrong",key,now}),null);
 assert.equal(readStudioOAuthAttempt({cookie:attempt.cookie+"x",state,key,now}),null);
 assert.equal(readStudioOAuthAttempt({cookie:attempt.cookie,state,key,now:now+16*60*1000}),null);
});

test("GitHub OAuth exchange sends the PKCE verifier only over direct POST and rejects failures", async () => {
 const attempt=createStudioOAuthAttempt({workspaceId,actorId,installationId:77,state,key,now});
 const proof=readStudioOAuthAttempt({cookie:attempt.cookie,state,key,now});
 let calls=0;
 const request=async (url,opts)=>{
   calls++;
   assert.equal(url,"https://github.com/login/oauth/access_token");
   assert.equal(opts.method,"POST");
   assert.equal(opts.redirect,"error");
   const payload=JSON.parse(opts.body);
   assert.equal(payload.code_verifier,proof.verifier);
   assert.equal(payload.redirect_uri,location);
   assert.equal(payload.client_secret,"fake-server-secret");
   return json({access_token:"unit-test-user-token",expires_in:28800,token_type:"bearer",
     refresh_token:"discard-this-token"});
 };
 const result=await exchangeStudioOAuthCode({code:"abcdef1234567890",verifier:proof.verifier,
  clientId:"Iv1.testClient",clientSecret:"fake-server-secret",redirectUri:location,request});
 assert.deepEqual(result,{accessToken:"unit-test-user-token",lifetimeSeconds:28800});
 assert.equal(calls,1);
 await assert.rejects(exchangeStudioOAuthCode({code:"abcdef1234567890",verifier:proof.verifier,
  clientId:"test",clientSecret:"test",redirectUri:location,
  request:async()=>json({error:"bad_verification_code",error_description:"secret-details"})}),
  e=>e.message==="OAUTH_EXCHANGE_FAILED"&&!e.message.includes("details"));
});

test("OAuth proof checks real User account and explicit app installation permission",async()=>{
 const calls=[];
 const request=async (url,opts)=>{
   calls.push(url);
   assert.equal(opts.headers.Authorization,"Bearer unit-test-user-token");
   if(url.endsWith("/user"))return json({id:12,login:"octocat",type:"User"});
   return json({total_count:1,installations:[{id:77,target_type:"User",suspended_at:null,
    account:{id:12,login:"octocat"},permissions:{repository_creation:"write"}}]});
 };
 const r=await verifyStudioOAuthAccount({accessToken:"unit-test-user-token",installationId:77,request});
 assert.deepEqual(r,{userId:12,login:"octocat"});
 assert.equal(calls.length,2);
 const denied=async (url)=>url.endsWith("/user")?
   json({id:12,login:"octocat",type:"User"}):
   json({total_count:1,installations:[{id:77,target_type:"User",account:{id:99,login:"attacker"},
     permissions:{repository_creation:"write"}}]});
 await assert.rejects(verifyStudioOAuthAccount({accessToken:"unit-test-user-token",
   installationId:77,request:denied}),e=>e.message==="OAUTH_PERMISSION_REQUIRED");
});

test("encrypted ephemeral user token is actor, installation and workspace bound",()=>{
 const cookie=sealStudioUserGrant({accessToken:"unit-test-user-token",githubUserId:12,
   githubLogin:"octocat",workspaceId,actorId,installationId:77,key,
   lifetimeSeconds:28800,now});
 assert.ok(!cookie.includes("unit-test-user-token"));
 assert.deepEqual(readStudioUserGrant({cookie,workspaceId,actorId,installationId:77,key,now}),
   {accessToken:"unit-test-user-token",githubUserId:12,githubLogin:"octocat"});
 assert.equal(readStudioUserGrant({cookie,workspaceId,actorId,installationId:77,key,now:now+601000}),null);
 assert.equal(readStudioUserGrant({cookie,workspaceId,actorId,installationId:78,key,now}),null);
 assert.equal(readStudioUserGrant({cookie,workspaceId,actorId:"22222222-2222-4222-8222-222222222222",
  installationId:77,key,now}),null);
 assert.equal(readStudioUserGrant({cookie:cookie.replace(/^./, cookie[0] === "A" ? "B" : "A"),workspaceId,actorId,
  installationId:77,key,now}),null);
});
