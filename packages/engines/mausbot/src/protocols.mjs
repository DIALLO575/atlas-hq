/**
 * Offline transport primitives; NO socket, subprocess, engine token, or provider action.
 * They are safe to unit-test before ATLAS connects a live runtime.
 */
import { MAUSBOT_PRIMITIVES, validateMausbotPrimitive, PrimitiveInputError } from "../../../engine-core/src/primitives.mjs";
const isRecord = (value) => value && typeof value === "object" && !Array.isArray(value);
const cleanId = (value) => typeof value === "string" && /^[A-Za-z0-9_-]{1,120}$/.test(value);

export function planMausbotMcpCall(primitiveId, args = {}, requestId = 1) {
  const { def, args: checked } = validateMausbotPrimitive(primitiveId, args);
  if (!(typeof requestId === "string" && cleanId(requestId)) &&
    !(Number.isSafeInteger(requestId) && requestId >= 0)) throw new PrimitiveInputError("MCP_REQUEST_ID_INVALID");
  return {
    jsonrpc: "2.0", id: requestId,
    method: "tools/call",
    params: { name: def.tool, arguments: checked },
  };
}
export function normalizeMausbotMcpResponse(data, expectedId) {
  const response = typeof data === "string" && data.length <= 1_048_576 ? JSON.parse(data) : data;
  if (!isRecord(response) || response.jsonrpc !== "2.0" || response.id !== expectedId ||
      ("error" in response && "result" in response)) throw new PrimitiveInputError("MCP_RESPONSE_INVALID");
  if ("error" in response) {
    const error = new PrimitiveInputError("MCP_CALL_FAILED");
    error.status = 502;
    throw error;
  }
  if (!("result" in response)) throw new PrimitiveInputError("MCP_RESPONSE_INVALID");
  // MCP tool result may contain arbitrarily structured sensitive data. It must
  // be passed through a provider-specific result projector, not returned raw to a browser.
  return { acknowledged: true, hasToolResult: response.result !== undefined };
}

/** Decode one complete SSE frame. Line-based parser; do not feed unbounded streams. */
export function parseMausbotSseBlock(block) {
  if (typeof block !== "string" || block.length > 65536) throw new PrimitiveInputError("SSE_FRAME_INVALID");
  const lines = block.replace(/\r\n/g, "\n").split("\n");
  let cursor = null;
  const parts = [];
  for (const line of lines) {
    if (line.startsWith("id:")) {
      const raw = line.slice(3).trim();
      if (raw.length > 300 || /[\r\n\x00]/.test(raw)) throw new PrimitiveInputError("SSE_CURSOR_INVALID");
      cursor = raw || null;
    } else if (line.startsWith("data:")) {
      parts.push(line.slice(5).replace(/^ /, ""));
    }
  }
  if (!parts.length) return null;
  let parsed;
  try { parsed = JSON.parse(parts.join("\n")); }
  catch { throw new PrimitiveInputError("SSE_PAYLOAD_INVALID"); }
  if (!isRecord(parsed) || typeof parsed.kind !== "string") throw new PrimitiveInputError("SSE_PAYLOAD_INVALID");
  const result = { kind: parsed.kind, cursor, threadId: typeof parsed.threadId === "string" ? parsed.threadId : null };
  // Trust only the server's cursor, never a client-generated resume value.
  if (parsed.kind === "hello") {
    return { kind: "hello", cursor, resumed: parsed.resumed === true,
      requiresResync: parsed.resumed === false, serverCursor: typeof parsed.cursor === "string" ? parsed.cursor : null };
  }
  if (parsed.kind === "ping") return { kind: "ping", cursor };
  if (parsed.kind === "message" || parsed.kind === "message.patch") {
    // Do not forward screenshot pixels or permission card payloads.
    const msg = isRecord(parsed.message) ? parsed.message : {};
    return { ...result, message: {
      id: typeof msg.id === "string" ? msg.id : null,
      role: typeof msg.role === "string" ? msg.role : null,
      kind: typeof msg.kind === "string" ? msg.kind : null,
      text: typeof msg.text === "string" ? msg.text.slice(0, 32000) : null,
      hasImage: Boolean(msg.kind === "screen" || msg.hasImage),
    } };
  }
  if (parsed.kind === "bot" || parsed.kind === "group") {
    const target = isRecord(parsed[parsed.kind]) ? parsed[parsed.kind] : {};
    return { ...result, targetId: typeof target.id === "string" ? target.id : null,
      activeTaskId: typeof target.threadId === "string" ? target.threadId : null };
  }
  if (parsed.kind === "runtime") return { ...result, threadId: typeof parsed.event?.threadId === "string" ? parsed.event.threadId : null };
  return { ...result, needsReconciliation: true };
}

/**
 * Headless CLI plans for an operator-owned worker, not for Vercel route execution.
 * Filenames must be pre-provisioned inside an allowlisted worker directory;
 * strings are NEVER passed through shell interpolation.
 */
function teamFile(value) {
  if (typeof value !== "string" || !/^\/srv\/atlas\/teams\/[a-zA-Z0-9_-]{1,80}\.(yaml|json)$/.test(value)) {
    throw new PrimitiveInputError("CLI_TEAM_FILE_INVALID");
  }
  return value;
}
export function planMausbotCli(action, args = {}) {
  if (!isRecord(args)) throw new PrimitiveInputError("CLI_INPUT_INVALID");
  const verbs = {
    "doctor": { fields: [], argv: ["doctor", "--json"] },
    "teams.dry-run": { fields: ["file"], argv: args.file ? ["team", "apply", teamFile(args.file), "--dry-run", "--json"] : null },
    "teams.check": { fields: ["file"], argv: args.file ? ["team", "apply", teamFile(args.file), "--check", "--json"] : null },
    "teams.apply": { fields: ["file", "approved"], argv: args.file && args.approved === true ?
      ["team", "apply", teamFile(args.file), "--json"] : null },
    "engine.list": { fields: [], argv: ["engine", "list", "--json"] },
  };
  if (!(action in verbs)) throw new PrimitiveInputError("CLI_ACTION_NOT_SUPPORTED");
  const spec = verbs[action];
  if (Object.keys(args).some((key) => !spec.fields.includes(key)) || !spec.argv ||
      (action === "teams.apply" && args.approved !== true)) throw new PrimitiveInputError("CLI_INPUT_INVALID");
  return { runtime: "external-durable-worker", executable: "openmausbot",
    argv: spec.argv, spawnAllowedOnVercel: false, shell: false };
}
export const MAUSBOT_MCP_TOOL_COUNT = MAUSBOT_PRIMITIVES.length;
