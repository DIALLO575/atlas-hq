import { randomUUID } from "node:crypto";
import { ATLAS_WORKSPACE_ID, MAUSBOT_OBJECT_ID } from "../../../engine-core/src/catalog.mjs";

export class MausbotAdapterError extends Error {
  constructor(code, status = 502) {
    super(code);
    this.name = "MausbotAdapterError";
    this.code = code;
    this.status = status;
  }
}

/**
 * One MAUSBOT installation is bound to exactly one ATLAS workspace in v0.
 * Never derive an engine URL or bearer token from browser-controlled input.
 * Secrets are not stored in ATLAS, returned to callers, or logged.
 */
export function resolveMausbotConfig(env, workspaceId) {
  if (!ATLAS_WORKSPACE_ID.test(workspaceId ?? "") || env.ATLAS_MAUSBOT_WORKSPACE_ID !== workspaceId) return null;
  const rawUrl = env.ATLAS_MAUSBOT_URL?.trim();
  const token = env.ATLAS_MAUSBOT_TOKEN?.trim();
  if (!rawUrl || !token) return null;
  let url;
  try { url = new URL(rawUrl); } catch { throw new MausbotAdapterError("MAUSBOT_URL_INVALID", 503); }
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if ((url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) ||
      url.username || url.password || url.search || url.hash || url.pathname !== "/") {
    throw new MausbotAdapterError("MAUSBOT_URL_INVALID", 503);
  }
  return { baseUrl: url.origin, token };
}

function objectId(value) {
  if (typeof value !== "string" || !MAUSBOT_OBJECT_ID.test(value)) {
    throw new MausbotAdapterError("MAUSBOT_ID_INVALID", 400);
  }
  return value;
}

export async function mausbotRequest(config, path, { method = "GET", body, timeoutMs = 8000, fetchImpl = fetch } = {}) {
  const headers = { Accept: "application/json", Authorization: "Bearer " + config.token };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  let response;
  try {
    response = await fetchImpl(config.baseUrl + path, {
      method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      cache: "no-store", redirect: "manual", signal: AbortSignal.timeout(Math.min(26000, Math.max(1000, timeoutMs))),
    });
  } catch {
    throw new MausbotAdapterError("MAUSBOT_UNREACHABLE", 503);
  }
  if (response.status >= 300 && response.status < 400) throw new MausbotAdapterError("MAUSBOT_REDIRECT_REFUSED", 502);
  if (response.status === 401 || response.status === 403) throw new MausbotAdapterError("MAUSBOT_AUTH_REFUSED", 502);
  if (!response.ok) throw new MausbotAdapterError("MAUSBOT_UPSTREAM_ERROR", 502);
  if (Number(response.headers.get("content-length") || 0) > 1_048_576) throw new MausbotAdapterError("MAUSBOT_PAYLOAD_TOO_LARGE", 502);
  let raw;
  try { raw = await response.text(); } catch { throw new MausbotAdapterError("MAUSBOT_READ_FAILED", 502); }
  if (raw.length > 1_048_576) throw new MausbotAdapterError("MAUSBOT_PAYLOAD_TOO_LARGE", 502);
  try { return JSON.parse(raw); } catch { throw new MausbotAdapterError("MAUSBOT_RESPONSE_INVALID", 502); }
}

export async function mausbotHealth(config, deps) {
  const health = await mausbotRequest(config, "/api/health", deps);
  if (health?.app !== "openmausbot") throw new MausbotAdapterError("MAUSBOT_IDENTITY_MISMATCH", 502);
  return { online: true, engine: "mausbot" };
}

export async function mausbotAgents(config, deps) {
  const result = await mausbotRequest(config, "/api/bots", deps);
  if (!Array.isArray(result?.bots)) throw new MausbotAdapterError("MAUSBOT_RESPONSE_INVALID", 502);
  return result.bots.filter((bot) => bot && typeof bot.id === "string" && MAUSBOT_OBJECT_ID.test(bot.id))
    .map((bot) => ({
      id: bot.id,
      name: typeof bot.name === "string" ? bot.name.slice(0, 160) : bot.id,
      emoji: typeof bot.emoji === "string" ? bot.emoji.slice(0, 8) : null,
    }));
}

/** A new task is created with approval mode ASK, never Full. */
export async function mausbotDispatch(config, { botId, title, instruction }, deps) {
  const id = objectId(botId);
  if (typeof title !== "string" || !title.trim() || title.trim().length > 120 ||
      typeof instruction !== "string" || !instruction.trim() || instruction.trim().length > 4000) {
    throw new MausbotAdapterError("MAUSBOT_DISPATCH_INVALID", 400);
  }
  const bots = await mausbotAgents(config, deps);
  if (!bots.some((bot) => bot.id === id)) throw new MausbotAdapterError("MAUSBOT_BOT_NOT_FOUND", 404);
  const result = await mausbotRequest(config, "/api/bots/" + encodeURIComponent(id) + "/tasks", {
    ...deps, method: "POST", body: { title: title.trim(), approvalMode: "ask" },
  });
  const threadId = result?.task?.threadId;
  if (typeof threadId !== "string" || !MAUSBOT_OBJECT_ID.test(threadId)) {
    throw new MausbotAdapterError("MAUSBOT_TASK_RESPONSE_INVALID", 502);
  }
  const sendId = randomUUID().replace(/-/g, "");
  try {
    await mausbotRequest(config, "/api/bots/" + encodeURIComponent(id) + "/messages", {
      ...deps, method: "POST",
      body: { threadId, text: instruction.trim(), sendId },
    });
  } catch (error) {
    // Do not retry task creation: a real task exists. Report the partial outcome.
    return { accepted: false, taskCreated: true, botId: id, threadId, sendId,
      error: error instanceof MausbotAdapterError ? error.code : "MAUSBOT_SEND_FAILED" };
  }
  // HTTP 202 means accepted, not completed.
  return { accepted: true, taskCreated: true, botId: id, threadId, sendId };
}

export async function mausbotJob(config, threadId, deps) {
  const id = objectId(threadId);
  const data = await mausbotRequest(config, "/api/threads/" + encodeURIComponent(id) + "/job?scope=job", deps);
  if (!data || typeof data !== "object") throw new MausbotAdapterError("MAUSBOT_RESPONSE_INVALID", 502);
  return {
    threadId: id,
    status: typeof data.status === "string" ? data.status : null,
    state: typeof data.state === "string" ? data.state : null,
    version: typeof data.version === "number" ? data.version : null,
    phase: typeof data.phase === "string" ? data.phase : null,
  };
}
