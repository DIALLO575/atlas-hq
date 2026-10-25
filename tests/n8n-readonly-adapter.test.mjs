import test from "node:test";
import assert from "node:assert/strict";
import {
  N8nReadOnlyError, resolveN8nReadOnlyConfig, testN8nConnection,
  listN8nWorkflows, getN8nWorkflowMetadata,
  listN8nExecutions, getN8nExecutionStatus,
} from "../packages/engines/n8n/src/adapter.mjs";

const workspaceId = "123e4567-e89b-42d3-a456-426614174000";
const token = ["test", "only", "not", "an", "api", "key"].join("-");
const baseEnv = Object.freeze({
  ATLAS_N8N_WORKSPACE_ID: workspaceId,
  ATLAS_N8N_BASE_URL: "https://atlas-n8n.example.org/",
  ATLAS_N8N_ALLOWED_HOST: "atlas-n8n.example.org",
  ATLAS_N8N_API_KEY: token,
});
const config = resolveN8nReadOnlyConfig(baseEnv, workspaceId);
const dnsLookup = async () => [{ address: "8.8.8.8", family: 4 }];
const good = (json, status = 200, headers = {}) => new Response(JSON.stringify(json), { status, headers: { "content-type": "application/json", ...headers } });
const mk = (response, observer = () => {}) => ({ dnsLookup, fetchImpl: async (url, init) => { observer(url, init); return typeof response === "function" ? response(url, init) : response; } });
const isError = (code) => (err) => err instanceof N8nReadOnlyError && err.code === code;
const wf = (id = "wf1") => ({ id, name: "My Flow", active: true, createdAt: "2026-10-25T08:00:00.000Z", updatedAt: "2026-10-25T09:00:00.000Z", nodes: [{ credentials: { token }, parameters: { password: token } }], settings: { secret: token } });
const exec = (id = "22", workflowId = "wf1") => ({ id, workflowId, status: "success", finished: true, startedAt: "2026-10-25T08:00:00.000Z", stoppedAt: "2026-10-25T08:00:02.000Z", data: { resultData: { runData: { token } } }, error: { message: token } });

test("config is strictly server-bound to one workspace, exact host, HTTPS/443 and API key", () => {
  assert.equal(resolveN8nReadOnlyConfig({}, workspaceId), null);
  assert.equal(resolveN8nReadOnlyConfig(baseEnv, "123e4567-e89b-42d3-a456-426614174001"), null);
  assert.deepEqual({host:config.hostname, origin: config.baseUrl}, {host:"atlas-n8n.example.org", origin:"https://atlas-n8n.example.org"});
  assert.ok(Object.isFrozen(config));
  for (const url of ["http://atlas-n8n.example.org/", "https://localhost/", "https://127.0.0.1/", "https://atlas-n8n.example.org:8443/", "https://user@atlas-n8n.example.org/", "https://atlas-n8n.example.org/api/", "https://atlas-n8n.example.org/?key=secret", "https://atlas-n8n.example.org/#fragment"]) {
    assert.throws(() => resolveN8nReadOnlyConfig({...baseEnv, ATLAS_N8N_BASE_URL: url}, workspaceId), isError("N8N_CONFIG_INVALID"));
  }
  assert.throws(() => resolveN8nReadOnlyConfig({...baseEnv, ATLAS_N8N_ALLOWED_HOST:"evil.example.org"}, workspaceId), isError("N8N_CONFIG_INVALID"));
  assert.throws(() => resolveN8nReadOnlyConfig({...baseEnv, ATLAS_N8N_API_KEY:"bad\r\nheader"}, workspaceId), isError("N8N_CONFIG_INVALID"));
});

test("only GET public API v1, no credentials in URL, cache, body or returned object", async () => {
  const sent = [];
  const result = await listN8nWorkflows(config, { limit: 20, cursor: "next/1==" }, mk(good({ data: [wf()], nextCursor: null }), (url, init) => sent.push({url, init})));
  assert.equal(sent.length, 1);
  const request = sent[0];
  const url = new URL(request.url);
  assert.equal(url.pathname, "/api/v1/workflows");
  assert.equal(url.searchParams.get("limit"), "20");
  assert.equal(url.searchParams.get("cursor"), "next/1==");
  assert.equal(request.init.method, "GET");
  assert.equal(request.init.headers["X-N8N-API-KEY"], token);
  assert.equal(request.init.redirect, "manual");
  assert.equal(request.init.cache, "no-store");
  assert.equal(request.init.body, undefined);
  assert.equal(request.url.includes(token), false);
  assert.equal(JSON.stringify(result).includes(token), false);
  assert.equal(JSON.stringify(result).includes("nodes"), false);
  assert.deepEqual(result.data[0], {id:"wf1", name:"My Flow", active:true, createdAt:"2026-10-25T08:00:00.000Z", updatedAt:"2026-10-25T09:00:00.000Z"});
});

test("read-only probe fetches a single workflow, does not claim engine capabilities", async () => {
  let path;
  const result = await testN8nConnection(config, mk(good({data:[wf()], nextCursor:null}), (url) => path = new URL(url)));
  assert.deepEqual(result, {reachable:true, api:"n8n-public-v1", readOnly:true});
  assert.equal(path.searchParams.get("limit"), "1");
});

test("single workflow response is identity-bound and returns no nodes/credentials", async () => {
  const v = await getN8nWorkflowMetadata(config, "wf1", mk(good(wf())));
  assert.equal(v.id, "wf1");
  assert.equal(JSON.stringify(v).includes(token), false);
  await assert.rejects(getN8nWorkflowMetadata(config, "wf1", mk(good(wf("wf2")))), isError("N8N_IDENTITY_MISMATCH"));
  await assert.rejects(getN8nWorkflowMetadata(config, "../admin", mk(() => {throw Error("fetch should never run");})), isError("N8N_ID_INVALID"));
});

test("execution list filters by workflowId and includeData=false and projects minimal fields", async () => {
  let u;
  const list = await listN8nExecutions(config, "wf1", {limit:10}, mk(good({data:[exec()],nextCursor:null}), url => u = new URL(url)));
  assert.equal(u.pathname,"/api/v1/executions");
  assert.equal(u.searchParams.get("workflowId"),"wf1");
  assert.equal(u.searchParams.get("includeData"),"false");
  assert.deepEqual(list.data[0], {id:"22",workflowId:"wf1", status:"success",finished:true,startedAt:"2026-10-25T08:00:00.000Z",stoppedAt:"2026-10-25T08:00:02.000Z"});
  assert.equal(JSON.stringify(list).includes(token),false);
  await assert.rejects(listN8nExecutions(config,"wf1",{},mk(good({data:[exec("33", "other")], nextCursor:null}))),isError("N8N_SCOPE_MISMATCH"));
});

test("execution detail verifies both execution id and workflow id", async () => {
  let u;
  const v=await getN8nExecutionStatus(config,"wf1","22",mk(good(exec()),url=>u=new URL(url)));
  assert.equal(v.status,"success");
  assert.equal(u.searchParams.get("includeData"),"false");
  assert.equal(u.pathname,"/api/v1/executions/22");
  assert.equal(JSON.stringify(v).includes(token),false);
  await assert.rejects(getN8nExecutionStatus(config,"wf1","22",mk(good(exec("22", "other")))),isError("N8N_SCOPE_MISMATCH"));
  await assert.rejects(getN8nExecutionStatus(config,"wf1","22",mk(good(exec("23", "wf1")))),isError("N8N_SCOPE_MISMATCH"));
});

test("untrusted configs, client fields, page bounds and cursor loops are rejected", async () => {
  await assert.rejects(listN8nWorkflows({...config}, {}, mk(good({data:[],nextCursor:null}))),isError("N8N_TRUSTED_CONFIG_REQUIRED"));
  for (const limit of [0,101,-1,"3",NaN,1.5]) {
    await assert.rejects(listN8nWorkflows(config,{limit},mk(good({data:[],nextCursor:null}))),isError("N8N_PAGE_INVALID"));
  }
  await assert.rejects(listN8nWorkflows(config,{userId:"other"},mk(good({data:[],nextCursor:null}))),isError("N8N_PAGE_INVALID"));
  await assert.rejects(listN8nWorkflows(config,{cursor:"bad\nheader"},mk(good({data:[],nextCursor:null}))),isError("N8N_CURSOR_INVALID"));
  await assert.rejects(listN8nWorkflows(config,{cursor:"abc"},mk(good({data:[],nextCursor:"abc"}))),isError("N8N_RESPONSE_INVALID"));
  await assert.rejects(listN8nWorkflows(config,{}, { ...mk(good({data:[],nextCursor:null})), token:"attack" }),isError("N8N_DEPS_INVALID"));
  await assert.rejects(listN8nWorkflows(config,{}, { ...mk(good({data:[],nextCursor:null})), timeoutMs:20000 }),isError("N8N_TIMEOUT_INVALID"));
});

test("DNS rejects private, loopback, mapped IPv4, missing and mixed public/private resolutions before fetch", async () => {
  for (const entries of [
    [{address:"127.0.0.1",family:4}], [{address:"10.1.1.1",family:4}],
    [{address:"169.254.169.254",family:4}], [{address:"192.168.0.1",family:4}],
    [{address:"::1",family:6}], [{address:"fc00::1",family:6}],
    [{address:"::ffff:127.0.0.1",family:6}],
    [{address:"1.1.1.1",family:4},{address:"127.0.0.1",family:4}],
    [],
  ]) {
    let calls=0;
    await assert.rejects(listN8nWorkflows(config,{}, {
      dnsLookup:async () => entries,
      fetchImpl:async () => {calls++;return good({data:[],nextCursor:null});},
    }),isError("N8N_NETWORK_DESTINATION_REFUSED"));
    assert.equal(calls,0);
  }
  await assert.rejects(listN8nWorkflows(config,{}, { dnsLookup:async ()=> {throw Error("DNS leak");},fetchImpl:async()=> good({data:[],nextCursor:null}) }),isError("N8N_DNS_UNAVAILABLE"));
});

test("redirect and authentication errors never expose credential, even in upstream bodies", async () => {
  for (const [status, code] of [[301,"N8N_REDIRECT_REFUSED"],[302,"N8N_REDIRECT_REFUSED"],[401,"N8N_AUTH_REFUSED"],[403,"N8N_AUTH_REFUSED"],[404,"N8N_RESOURCE_UNAVAILABLE"],[500,"N8N_UPSTREAM_ERROR"]]) {
    let error;
    try { await listN8nWorkflows(config,{},mk(good({error:token},status,{location:"http://127.0.0.1/"}))); }
    catch (e) {error=e;}
    assert.ok(isError(code)(error));
    assert.equal(String(error).includes(token),false);
    assert.equal(JSON.stringify(error).includes(token),false);
  }
});

test("429 returns bounded Retry-After without automated retries or secret leaks", async () => {
  let calls=0;
  await assert.rejects(listN8nWorkflows(config,{},mk(() => {calls++;return good({error:token},429,{"retry-after":"99999"});})),e => isError("N8N_RATE_LIMITED")(e) && e.retryAfterSeconds === 3600);
  assert.equal(calls,1);
  await assert.rejects(listN8nWorkflows(config,{},mk(good({error:token},429,{"retry-after":"55"}))),e => isError("N8N_RATE_LIMITED")(e) && e.retryAfterSeconds === 55);
});

test("network failure and hanging requests are normalized and bounded", async () => {
  await assert.rejects(listN8nWorkflows(config,{},mk(async () => { throw Error(token); })),isError("N8N_UNREACHABLE"));
});

test("response shape, item types, content-type, cursor and size are strict", async () => {
  await assert.rejects(listN8nWorkflows(config,{limit:1},mk(good({data:[wf("w1"),wf("w2")],nextCursor:null}))),isError("N8N_RESPONSE_INVALID"));
  for (const payload of [[], null, {data:{}}, {data:[{}]}, {data:Array(101).fill(wf())}, {data:[], nextCursor:23}, {data:[],nextCursor:"evil\n"}]) {
    await assert.rejects(listN8nWorkflows(config,{},mk(good(payload))),isError("N8N_RESPONSE_INVALID"));
  }
  await assert.rejects(listN8nWorkflows(config,{},mk(new Response("not json",{headers:{"content-type":"text/plain"}}))),isError("N8N_RESPONSE_INVALID"));
  await assert.rejects(listN8nWorkflows(config,{},mk(new Response("bad json",{headers:{"content-type":"application/json"}}))),isError("N8N_RESPONSE_INVALID"));
  await assert.rejects(listN8nWorkflows(config,{},mk(new Response("x".repeat(1_048_577),{headers:{"content-type":"application/json"}}))),isError("N8N_RESPONSE_TOO_LARGE"));
  await assert.rejects(listN8nWorkflows(config,{},mk(new Response("{}",{headers:{"content-type":"application/json","content-length":"2000000"}}))),isError("N8N_RESPONSE_TOO_LARGE"));
});
