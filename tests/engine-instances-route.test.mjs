import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("../src/app/api/engines/instances/route.ts", import.meta.url), "utf8");

test("Engine instance registry is a purely offline RLS-backed API",()=>{
 assert.match(src,/requireEngineWorkspace\(workspaceId\)/);
 assert.match(src,/requireEngineWorkspace\(body\.workspaceId, true\)/);
 assert.match(src,/from\("atlas_engine_instances"\)/);
 assert.match(src,/planEngineRegistration\(/);
 assert.match(src,/connection_state: "offline"/);
 assert.match(src,/version: 1/);
 assert.match(src,/note: "OFFLINE_ONLY"/);
 assert.doesNotMatch(src,/resolveMausbotConfig|mausbotRequest|mausbotDispatch|service_role|SUPABASE_SERVICE_ROLE/);
});

test("Instance route never accepts a browser-supplied creator or engine token",()=>{
 assert.match(src,/!\["workspaceId", "engineKey", "label", "transport"\]\.includes\(k\)/);
 assert.match(src,/createdBy: user\.id/);
 assert.match(src,/created_by: user\.id/);
 assert.match(src,/ORIGIN_FORBIDDEN/);
 assert.match(src,/CONTENT_TYPE_INVALID/);
 assert.doesNotMatch(src,/select\("\*"/);
 assert.match(src,/const columns = "id,workspace_id,engine_key,label,transport,connection_state,created_at"/);
});
