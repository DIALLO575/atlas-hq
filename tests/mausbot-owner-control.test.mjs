import test from "node:test";
import assert from "node:assert/strict";
import { mausbotOwnerControlPermission } from "../packages/engine-core/src/mausbot-owner-control.mjs";
import { mausbotReleasePermission } from "../packages/engine-core/src/release-gates.mjs";

const workspaceId = "04cbf82c-45e7-469b-8587-89abbe87ef4d";
const env = {
  ATLAS_MAUSBOT_WORKSPACE_ID: workspaceId,
  ATLAS_MAUSBOT_INSTANCE_ID: "f086ee4d-e1cb-44dc-a0e2-cd6039cf94f3",
  ATLAS_MAUSBOT_TOKEN_VERSION: "admin-reviewed-v1",
  ATLAS_MAUSBOT_RELEASE_STAGE: "admin",
  ATLAS_MAUSBOT_ADMIN_CONTROL_ENABLED: "true",
  ATLAS_MAUSBOT_ADMIN_IDENTITY_VERIFIED: "true",
};
test("owner direct action requires correct workspace and exact reviewed release", () => {
  for (const mode of ["write", "execute"]) {
    assert.equal(mausbotOwnerControlPermission(env, { role: "owner", workspaceId, mode }).allowed, true);
    for (const role of ["admin", "member", undefined]) {
      assert.equal(mausbotOwnerControlPermission(env, { role, workspaceId, mode }).allowed, false);
    }
    assert.equal(mausbotOwnerControlPermission(env, { role:"owner",workspaceId:"4ff6d55e-7c20-4182-9bc1-d7d2ff327e38",mode }).allowed, false);
    for (const key of ["ATLAS_MAUSBOT_INSTANCE_ID", "ATLAS_MAUSBOT_TOKEN_VERSION", "ATLAS_MAUSBOT_ADMIN_CONTROL_ENABLED", "ATLAS_MAUSBOT_ADMIN_IDENTITY_VERIFIED"]) {
      const copy = { ...env }; delete copy[key];
      assert.equal(mausbotOwnerControlPermission(copy, { role:"owner",workspaceId,mode }).allowed,false,key);
    }
    for (const stage of [undefined, "offline", "enabled", "read-only"]) {
      assert.equal(mausbotOwnerControlPermission({ ...env,ATLAS_MAUSBOT_RELEASE_STAGE:stage }, {role:"owner",workspaceId,mode}).allowed,false,String(stage));
    }
  }
});
test("legacy source-mapped routes still hard deny raw write/execute", () => {
  assert.equal(mausbotReleasePermission(env,"write").status,423);
  assert.equal(mausbotReleasePermission(env,"execute").status,423);
});
test("owner control never grants reads, unknown actions, or admin bypass",()=>{
  assert.equal(mausbotOwnerControlPermission(env,{role:"owner",workspaceId,mode:"read"}).allowed,false);
  assert.equal(mausbotOwnerControlPermission(env,{role:"owner",workspaceId,mode:"delete"}).allowed,false);
});
