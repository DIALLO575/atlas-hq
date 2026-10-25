import assert from "node:assert/strict";
import test from "node:test";
import { studioActivationMode, studioAllowedBinding } from "../packages/connectors/github/src/github-studio-activation.mjs";
const production={VERCEL_ENV:"production",ATLAS_GITHUB_STUDIO_WRITE_ENABLED:"production",
 ATLAS_GITHUB_STUDIO_APPROVAL_ENABLED:"production",ATLAS_GITHUB_STUDIO_OAUTH_ENABLED:"production"};
const sandbox={VERCEL_ENV:"preview",ATLAS_GITHUB_STUDIO_WRITE_ENABLED:"sandbox",
 ATLAS_GITHUB_STUDIO_APPROVAL_ENABLED:"sandbox",ATLAS_GITHUB_STUDIO_OAUTH_ENABLED:"sandbox",
 ATLAS_GITHUB_STUDIO_SANDBOX_WORKSPACE_ID:"work-1",ATLAS_GITHUB_STUDIO_SANDBOX_INSTALLATION_ID:"77"};
test("production activation requires three separate explicit production flags",()=>{
 assert.equal(studioActivationMode(production),"production");
 for (const field of ["ATLAS_GITHUB_STUDIO_WRITE_ENABLED","ATLAS_GITHUB_STUDIO_APPROVAL_ENABLED",
    "ATLAS_GITHUB_STUDIO_OAUTH_ENABLED"]){
  assert.equal(studioActivationMode({...production,[field]:undefined}),null);
  assert.equal(studioActivationMode({...production,[field]:"sandbox"}),null);
 }
 assert.equal(studioActivationMode({...production,VERCEL_ENV:"preview"}),null);
 assert.equal(studioActivationMode({...production,VERCEL_ENV:"development"}),null);
});
test("sandbox mode cannot accidentally activate production and binds exact tenant/installation",()=>{
 assert.equal(studioActivationMode(sandbox),"sandbox");
 assert.equal(studioActivationMode({...sandbox,VERCEL_ENV:"production"}),null);
 assert.equal(studioAllowedBinding("sandbox","work-1",77,sandbox),true);
 assert.equal(studioAllowedBinding("sandbox","other",77,sandbox),false);
 assert.equal(studioAllowedBinding("sandbox","work-1",78,sandbox),false);
 assert.equal(studioAllowedBinding("production","work-1",77,production),true);
});
