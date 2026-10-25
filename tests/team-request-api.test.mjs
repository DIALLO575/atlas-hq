import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { normalizeTeamRequestManifest } from "../packages/engines/mausbot/src/team-request.mjs";
const source = readFileSync(new URL("../src/app/api/engines/team-requests/route.ts", import.meta.url), "utf8");
function route({ denied = false, rpcError = false } = {}) {
 const calls = [];
 const exports = {};
 const client = { rpc: async (name, body) => {
  calls.push({ name, body });
  return rpcError ? { error: { message: "private SQL secret" }, data: null } :
   { error: null, data: [{ run_id: body.p_request_id, intent_digest: "a".repeat(64), decision: "pending", created: true, can_dispatch: false }] };
 } };
 vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
  exports, Buffer, require(name) {
   if (name === "@/lib/engines/access") return {
    engineFailure: (error, status) => ({ status, data: { error } }),
    engineSuccess: (data, status = 200) => ({ status, data }),
    requireEngineWorkspace: async (_workspace, write) => { assert.equal(write, true); return denied ? { ok: false, response: { status: 403 } } : { ok: true }; },
   };
   if (name === "@/lib/supabase/server") return { createSupabaseServerClient: async () => client };
   if(name.endsWith("team-request.mjs")) return { normalizeTeamRequestManifest };
   return {};
  },
 });
 return { handler: exports.POST, calls };
}
const body = { workspaceId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", instanceId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", missionId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", requestId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd", manifest: {
 format:"openmaus.team",version:2,team:{name:"Equipe",description:"",members:[{key:"vision",name:"VISION",title:"Analyse",description:"",appearance:{color:"blue"}}]}
} };
function request(payload = body, origin = "https://atlas.example.test") {
 return { headers: new Headers({ origin, "content-type": "application/json" }), nextUrl: new URL("https://atlas.example.test/api/engines/agent-requests"), text: async () => JSON.stringify(payload) };
}
test("team request endpoint rejects cross-origin, forged approval/actor/token and malformed profiles before SQL", async () => {
 const f = route();
 assert.equal((await f.handler(request(body, "https://evil.example"))).status, 403);
 for (const field of ["approved", "actorId", "token", "primitiveId"]) assert.equal((await f.handler(request({ ...body, [field]: true }))).status, 400);
 for (const patch of [{manifest: {}}, {manifest: {...body.manifest, tools:["full"]}}, {instanceId: "invalid"}]) assert.equal((await f.handler(request({...body,...patch}))).status, 400);
 assert.equal(f.calls.length, 0);
});
test("team request respects membership gate and sends only exact profile/resource parameters", async () => {
 const denied = route({ denied: true }); assert.equal((await denied.handler(request())).status, 403); assert.equal(denied.calls.length, 0);
 const f = route(); const result = await f.handler(request());
 assert.equal(result.status, 201); assert.equal(result.data.canDispatch, false);
 assert.equal(f.calls[0].name, "atlas_engine_request_team");
 assert.deepEqual(Object.keys(f.calls[0].body).sort(), ["p_workspace_id", "p_instance_id", "p_mission_id", "p_request_id", "p_manifest"].sort());
});
test("SQL failure remains unavailable without reflecting secrets", async () => {
 const f = route({ rpcError: true }); const result = await f.handler(request());
 assert.equal(result.status, 409); assert.equal(JSON.stringify(result).includes("private SQL secret"), false);
});
