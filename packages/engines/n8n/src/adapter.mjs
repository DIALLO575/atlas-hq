/**
 * SHA-173: server-only, strictly read-only n8n Public API adapter.
 * No browser route, grant, runtime activation, write call or secret storage.
 * Caller MUST authorize actor, workspace, instance and workflow separately.
 * All destinations must be operator-configured and subject to egress controls.
 */
import { lookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";
import { validateN8nRemoteId } from "./contracts.mjs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SAFE_HOST = /^(?=.{1,253}$)[a-z0-9](?:[a-z0-9.-]*[a-z0-9])$/;
const MAX_BODY = 1_048_576;
const MAX_PAGE = 100;
const SAFE_CURSOR = /^[\x21-\x7e]{1,400}$/;
const CONFIGS = new WeakSet();
const isRecord = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const uuid = (v) => typeof v === "string" && UUID.test(v);

export class N8nReadOnlyError extends Error {
  constructor(code, status = 502, retryAfterSeconds = null) {
    super(code);
    this.name = "N8nReadOnlyError";
    this.code = code;
    this.status = status;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}
const fail = (code, status = 502, retryAfterSeconds = null) => {
  throw new N8nReadOnlyError(code, status, retryAfterSeconds);
};

const reserved = new BlockList();
for (const [network, prefix] of [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10],
  ["127.0.0.0", 8], ["169.254.0.0", 16], ["172.16.0.0", 12],
  ["192.0.0.0", 24], ["192.0.2.0", 24], ["192.168.0.0", 16],
  ["198.18.0.0", 15], ["198.51.100.0", 24], ["203.0.113.0", 24],
  ["224.0.0.0", 4], ["240.0.0.0", 4],
]) reserved.addSubnet(network, prefix, "ipv4");
for (const [network, prefix] of [
  ["::", 128], ["::1", 128], ["fc00::", 7], ["fe80::", 10],
  ["2001:db8::", 32], ["ff00::", 8],
]) reserved.addSubnet(network, prefix, "ipv6");
function publicAddress(address, family) {
  const actual = isIP(address);
  if ((family !== 4 && family !== 6) || actual !== family) return false;
  if (family === 6 && /^::ffff:/i.test(address)) return false;
  return !reserved.check(address, family === 4 ? "ipv4" : "ipv6");
}
function validHost(host) {
  return SAFE_HOST.test(host) && host.includes(".") &&
    !host.includes("..") && !host.endsWith(".localhost") &&
    !host.endsWith(".local") && !host.endsWith(".internal") &&
    !host.endsWith(".test") && !host.endsWith(".invalid") &&
    !host.endsWith(".example") && host !== "localhost" && !isIP(host);
}

/** Only a single explicit workspace/hostname server binding is supported. */
export function resolveN8nReadOnlyConfig(env, workspaceId) {
  if (!uuid(workspaceId) || env?.ATLAS_N8N_WORKSPACE_ID !== workspaceId) return null;
  const rawUrl = env.ATLAS_N8N_BASE_URL;
  const value = env.ATLAS_N8N_API_KEY;
  const allowedHost = env.ATLAS_N8N_ALLOWED_HOST;
  if (rawUrl === undefined && value === undefined && allowedHost === undefined) return null;
  if (typeof rawUrl !== "string" || typeof value !== "string" || typeof allowedHost !== "string") {
    fail("N8N_CONFIG_INVALID", 503);
  }
  let url;
  try { url = new URL(rawUrl); } catch { fail("N8N_CONFIG_INVALID", 503); }
  // HTTPS/443 only. Additional ports or path prefixes require reviewed egress policy.
  const hostname = url.hostname.toLowerCase();
  if (url.protocol !== "https:" || url.port || url.pathname !== "/" ||
      url.username || url.password || url.search || url.hash ||
      hostname !== allowedHost.toLowerCase() || !validHost(hostname) ||
      !/^[^\s\x00-\x1f\x7f]{16,512}$/.test(value)) {
    fail("N8N_CONFIG_INVALID", 503);
  }
  // The trusted config is intentionally NOT serializable with its API key.
  // JS possessing the object can still read value: never hand it to browsers.
  const config = Object.freeze(Object.defineProperty(
    { baseUrl: url.origin, hostname, workspaceId }, "apiKey",
    { value: value, enumerable: false, writable: false, configurable: false },
  ));
  CONFIGS.add(config);
  return config;
}

function trusted(config) {
  if (!isRecord(config) || !CONFIGS.has(config)) fail("N8N_TRUSTED_CONFIG_REQUIRED", 503);
}
function checkPage(options) {
  if (!isRecord(options) || Object.keys(options).some((key) => !["limit", "cursor"].includes(key))) {
    fail("N8N_PAGE_INVALID", 400);
  }
  const limit = options.limit ?? 50;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_PAGE) fail("N8N_PAGE_INVALID", 400);
  const cursor = options.cursor;
  if (cursor !== undefined && (typeof cursor !== "string" || !SAFE_CURSOR.test(cursor))) {
    fail("N8N_CURSOR_INVALID", 400);
  }
  return { limit, cursor };
}
function checkDeps(deps) {
  if (!isRecord(deps) || Object.keys(deps).some((key) => !["fetchImpl", "dnsLookup", "timeoutMs"].includes(key))) {
    fail("N8N_DEPS_INVALID", 400);
  }
  const timeoutMs = deps.timeoutMs ?? 8000;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 10000) {
    fail("N8N_TIMEOUT_INVALID", 400);
  }
  return { fetchImpl: deps.fetchImpl ?? fetch, dnsLookup: deps.dnsLookup ?? lookup, timeoutMs };
}
function goodId(value) {
  // n8n execution IDs have historically been represented as numbers or strings.
  if (Number.isSafeInteger(value) && value > 0) return String(value);
  if (typeof value === "string") {
    try { return validateN8nRemoteId(value); } catch { /* normalized below */ }
  }
  fail("N8N_RESPONSE_INVALID");
}
function inputId(value) {
  try { return validateN8nRemoteId(value); } catch { fail("N8N_ID_INVALID", 400); }
}
function safeTime(value) {
  return typeof value === "string" && value.length <= 40 &&
    /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d/.test(value) &&
    Number.isFinite(Date.parse(value)) ? value : null;
}
function workflow(data) {
  if (!isRecord(data)) fail("N8N_RESPONSE_INVALID");
  const id = goodId(data.id);
  if (typeof data.name !== "string") fail("N8N_RESPONSE_INVALID");
  return Object.freeze({
    id, name: data.name.slice(0, 160),
    active: data.active === true,
    createdAt: safeTime(data.createdAt), updatedAt: safeTime(data.updatedAt),
  });
}
function execution(data) {
  if (!isRecord(data)) fail("N8N_RESPONSE_INVALID");
  const id = goodId(data.id);
  const workflowId = goodId(data.workflowId);
  const validStatus = ["canceled", "error", "running", "success", "waiting", "new", "unknown"];
  const status = validStatus.includes(data.status) ? data.status : "unknown";
  return Object.freeze({
    id, workflowId, status,
    finished: data.finished === true,
    startedAt: safeTime(data.startedAt), stoppedAt: safeTime(data.stoppedAt),
  });
}
function list(data, projector, inputCursor, requestedLimit) {
  if (!isRecord(data) || !Array.isArray(data.data) || data.data.length > requestedLimit) {
    fail("N8N_RESPONSE_INVALID");
  }
  const nextCursor = data.nextCursor;
  if (nextCursor !== null && nextCursor !== undefined &&
      (typeof nextCursor !== "string" || !SAFE_CURSOR.test(nextCursor) || nextCursor === inputCursor)) {
    fail("N8N_RESPONSE_INVALID");
  }
  return Object.freeze({
    data: Object.freeze(data.data.map(projector)),
    nextCursor: nextCursor ?? null,
  });
}
async function bodyJson(response) {
  const length = response.headers.get("content-length");
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > MAX_BODY)) {
    fail("N8N_RESPONSE_TOO_LARGE");
  }
  const contentType = response.headers.get("content-type") ?? "";
  if (!/^application\/json(?:\s*;|\s*$)/i.test(contentType)) fail("N8N_RESPONSE_INVALID");
  let raw;
  try {
    if (response.body?.getReader) {
      const reader = response.body.getReader();
      const chunks = [];
      let bytes = 0;
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          bytes += value.byteLength;
          if (bytes > MAX_BODY) fail("N8N_RESPONSE_TOO_LARGE");
          chunks.push(value);
        }
      } finally { reader.releaseLock(); }
      const buffer = new Uint8Array(bytes);
      let offset = 0;
      for (const chunk of chunks) { buffer.set(chunk, offset); offset += chunk.byteLength; }
      raw = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
    } else {
      // Test doubles lacking streams only; native fetch responses use streams.
      raw = await response.text();
      if (Buffer.byteLength(raw, "utf-8") > MAX_BODY) fail("N8N_RESPONSE_TOO_LARGE");
    }
  } catch (err) {
    if (err instanceof N8nReadOnlyError) throw err;
    fail("N8N_RESPONSE_INVALID");
  }
  let parsed;
  try { parsed = JSON.parse(raw); } catch { fail("N8N_RESPONSE_INVALID"); }
  if (!isRecord(parsed)) fail("N8N_RESPONSE_INVALID");
  return parsed;
}

async function request(config, path, search = {}, deps = {}) {
  trusted(config);
  const { fetchImpl, dnsLookup, timeoutMs } = checkDeps(deps);
  // The BFF must still deploy network-level egress pinning: DNS checks alone
  // cannot eliminate DNS rebinding between lookup and HTTP connection.
  let addresses;
  try { addresses = await dnsLookup(config.hostname, { all: true, verbatim: true }); }
  catch { fail("N8N_DNS_UNAVAILABLE", 503); }
  if (!Array.isArray(addresses) || addresses.length === 0 || addresses.length > 16 ||
      addresses.some((a) => !isRecord(a) || !publicAddress(a.address, a.family))) {
    fail("N8N_NETWORK_DESTINATION_REFUSED", 503);
  }
  const url = new URL("/api/v1/" + path, config.baseUrl);
  for (const [key, value] of Object.entries(search)) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }
  let response;
  try {
    response = await fetchImpl(url.toString(), {
      method: "GET",
      headers: { Accept: "application/json", "X-N8N-API-KEY": config.apiKey },
      cache: "no-store", redirect: "manual", credentials: "omit",
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch { fail("N8N_UNREACHABLE", 503); }
  if (!response || typeof response.status !== "number" || !response.headers?.get) {
    fail("N8N_RESPONSE_INVALID");
  }
  if (response.status >= 300 && response.status < 400) fail("N8N_REDIRECT_REFUSED");
  if (response.status === 401 || response.status === 403) fail("N8N_AUTH_REFUSED", 502);
  if (response.status === 404) fail("N8N_RESOURCE_UNAVAILABLE", 404);
  if (response.status === 429) {
    const retry = response.headers.get("retry-after");
    const seconds = typeof retry === "string" && /^\d{1,5}$/.test(retry) ?
      Math.min(Number(retry), 3600) : null;
    fail("N8N_RATE_LIMITED", 429, seconds);
  }
  if (response.status < 200 || response.status >= 300) fail("N8N_UPSTREAM_ERROR");
  return bodyJson(response);
}

/** Probe API credentials with only a single metadata item, never a health mutation. */
export async function testN8nConnection(config, deps = {}) {
  const payload = await request(config, "workflows", { limit: 1 }, deps);
  if (!Array.isArray(payload.data) || payload.data.length > 1) fail("N8N_RESPONSE_INVALID");
  payload.data.forEach(workflow);
  return Object.freeze({ reachable: true, api: "n8n-public-v1", readOnly: true });
}
export async function listN8nWorkflows(config, options = {}, deps = {}) {
  const { limit, cursor } = checkPage(options);
  const result = await request(config, "workflows", { limit, cursor }, deps);
  return list(result, workflow, cursor, limit);
}
export async function getN8nWorkflowMetadata(config, workflowId, deps = {}) {
  const id = inputId(workflowId);
  const result = workflow(await request(config, "workflows/" + encodeURIComponent(id), {}, deps));
  if (result.id !== id) fail("N8N_IDENTITY_MISMATCH");
  return result;
}
export async function listN8nExecutions(config, workflowId, options = {}, deps = {}) {
  const id = inputId(workflowId);
  const { limit, cursor } = checkPage(options);
  const result = await request(config, "executions", { workflowId: id, limit, cursor, includeData: false }, deps);
  const page = list(result, execution, cursor, limit);
  if (page.data.some((item) => item.workflowId !== id)) fail("N8N_SCOPE_MISMATCH");
  return page;
}
export async function getN8nExecutionStatus(config, workflowId, executionId, deps = {}) {
  const workflow = inputId(workflowId);
  const id = inputId(executionId);
  const result = execution(await request(config, "executions/" + encodeURIComponent(id), { includeData: false }, deps));
  if (result.id !== id || result.workflowId !== workflow) fail("N8N_SCOPE_MISMATCH");
  return result;
}
