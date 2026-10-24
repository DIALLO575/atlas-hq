/**
 * Source: OpenMausBot scripts/mcp-server.ts, public MCP surface (20 tools).
 * ATLAS primitive names are stable: provider tool names remain metadata.
 * "http" means a source-mapped HTTP adapter exists, not that a host was tested.
 * No approval-grant, credential-admin, computer-control or delete primitive.
 */
const definitions = [
  ["system.health", "get_system_health", "read", [], {}],
  ["agents.list", "list_bots", "read", [], {}],
  ["conversations.messages.list", "get_bot_messages", "read", ["bot_id"], { task_id: "id", limit: "messagesLimit" }],
  ["conversations.messages.send", "send_bot_message", "execute", ["bot_id", "text"], { task_id: "id", send_id: "sendId" }],
  ["agents.create", "create_bot", "write", ["name"], { title: "title", description: "description", section: "section", instance_id: "modelInstance", model: "model", effort: "effort" }],
  ["agents.update", "update_bot_profile", "write", ["bot_id"], { name: "name", title: "title", description: "description", section: "nullableSection" }],
  ["channels.list", "list_channels", "read", [], {}],
  ["channels.messages.list", "get_channel_messages", "read", ["channel_id"], { task_id: "id", limit: "messagesLimit" }],
  ["channels.messages.send", "send_channel_message", "execute", ["channel_id", "text"], { task_id: "id", send_id: "sendId" }],
  ["channels.create", "create_channel", "write", ["name", "member_ids"], { section: "section", bulletin: "bulletin", default_responder: "responder" }],
  ["channels.update", "update_channel", "write", ["channel_id"], { name: "name", member_ids: "memberIds", section: "nullableSection", bulletin: "bulletin", default_responder: "responder" }],
  ["tasks.create", "create_task", "write", ["target_type", "target_id"], { title: "taskTitle" }],
  ["tasks.activate", "switch_task", "write", ["target_type", "target_id", "task_id"], {}],
  ["tasks.rename", "rename_task", "write", ["target_type", "target_id", "task_id", "title"], {}],
  ["search.messages", "search_messages", "read", ["query"], { task_id: "id", limit: "searchLimit" }],
  ["jobs.wait", "wait_for_conversation", "read", ["target_type", "target_id"], { task_id: "id", timeout_seconds: "timeout", scope: "scope", since_ms: "sinceMs", after_version: "version" }],
  ["models.set", "set_bot_model", "write", ["bot_id", "instance_id", "model"], { task_id: "id", effort: "effort" }],
  ["conversations.messages.edit", "edit_bot_message", "execute", ["bot_id", "message_id", "text"], { task_id: "id" }],
  ["models.list", "list_available_models", "read", [], {}],
  ["jobs.interrupt", "interrupt_conversation", "execute", ["target_type", "target_id"], { task_id: "id" }],
];
const requiredTypes = Object.freeze({
  bot_id: "id", channel_id: "id", target_id: "id", task_id: "id", message_id: "id",
  name: "name", title: "taskTitle", text: "text", target_type: "targetType", member_ids: "memberIds",
  query: "query", instance_id: "modelInstance", model: "model",
});
export const MAUSBOT_PRIMITIVES = Object.freeze(definitions.map(([id, tool, mode, required, optional]) => Object.freeze({
  id, tool, mode, transport: "http", hostTested: false,
  required: Object.freeze(required),
  fields: Object.freeze({ ...Object.fromEntries(required.map((key) => [key, requiredTypes[key]])), ...optional }),
})));
export const MAUSBOT_PRIMITIVE_NAMES = Object.freeze(MAUSBOT_PRIMITIVES.map((p) => p.id));
const definitionsById = new Map(MAUSBOT_PRIMITIVES.map((p) => [p.id, p]));
export const MAUSBOT_FUTURE_SURFACES = Object.freeze([
  { id: "events.subscribe", transport: "sse", status: "planned" },
  { id: "teams.apply", transport: "cli", status: "planned" },
  { id: "teams.export", transport: "cli", status: "planned" },
  { id: "mcp.tools.configure", transport: "mcp-inbound", status: "planned" },
  { id: "skills.manage", transport: "http-cli", status: "planned" },
  { id: "routines.manage", transport: "http", status: "planned" },
  { id: "connectors.manage", transport: "http", status: "planned" },
  { id: "computer.control", transport: "companion", status: "restricted" },
  { id: "approvals.answer", transport: "human-ui", status: "restricted" },
  { id: "credentials.manage", transport: "human-ui", status: "restricted" },
]);
export class PrimitiveInputError extends Error {
  constructor(code) { super(code); this.code = code; this.status = 400; }
}
const validId = /^[\w-]{1,120}$/;
const validSendId = /^[A-Za-z0-9_-]{16,80}$/;
const validEffort = new Set(["none", "low", "medium", "high", "xhigh", "max"]);
function isObject(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
const trim = (value) => typeof value === "string" ? value.trim() : "";
function field(type, value) {
  switch (type) {
    case "id": return typeof value === "string" && validId.test(value);
    case "sendId": return typeof value === "string" && validSendId.test(value);
    case "targetType": return value === "bot" || value === "channel";
    case "effort": return validEffort.has(value);
    case "name": return trim(value).length >= 1 && trim(value).length <= 100;
    case "title": return typeof value === "string" && value.length <= 200;
    case "description": return typeof value === "string" && value.length <= 4000;
    case "section": return trim(value).length >= 1 && trim(value).length <= 60;
    case "nullableSection": return value === null || field("section", value);
    case "taskTitle": return trim(value).length >= 1 && trim(value).length <= 80;
    case "bulletin": return typeof value === "string" && value.length <= 12000;
    case "text": return trim(value).length >= 1 && trim(value).length <= 100000;
    case "query": return trim(value).length >= 1 && trim(value).length <= 500;
    case "modelInstance": case "model": return trim(value).length >= 1 && trim(value).length <= 150;
    case "messagesLimit": return Number.isInteger(value) && value >= 1 && value <= 200;
    case "searchLimit": return Number.isInteger(value) && value >= 1 && value <= 100;
    case "timeout": return Number.isInteger(value) && value >= 1 && value <= 120;
    case "sinceMs": return Number.isSafeInteger(value) && value >= 0;
    case "version": return typeof value === "string" && value.length >= 1 && value.length <= 100 && /^[a-zA-Z0-9_-]+$/.test(value);
    case "scope": return value === "job" || value === "turn";
    case "memberIds": return Array.isArray(value) && value.length >= 1 && value.length <= 64 &&
      value.every((item) => field("id", item)) && new Set(value).size === value.length;
    case "responder": return isObject(value) && Object.keys(value).every((key) => ["kind", "bot_id"].includes(key)) &&
      (value.kind === "everyone" || value.kind === "mentions" ? Object.keys(value).length === 1 :
        value.kind === "member" && field("id", value.bot_id) && Object.keys(value).length === 2);
    default: return false;
  }
}
export function getMausbotPrimitive(id) { return definitionsById.get(id) ?? null; }
/** Strict validation before any HTTP request. Unknown input and dangerous fields fail closed. */
export function validateMausbotPrimitive(id, input) {
  const def = getMausbotPrimitive(id);
  if (!def) throw new PrimitiveInputError("PRIMITIVE_NOT_SUPPORTED");
  if (!isObject(input)) throw new PrimitiveInputError("PRIMITIVE_INPUT_INVALID");
  for (const key of Object.keys(input)) {
    if (!(key in def.fields)) throw new PrimitiveInputError("PRIMITIVE_FIELD_NOT_ALLOWED");
    if (!field(def.fields[key], input[key])) throw new PrimitiveInputError("PRIMITIVE_FIELD_INVALID");
  }
  for (const key of def.required) if (!Object.hasOwn(input, key)) throw new PrimitiveInputError("PRIMITIVE_FIELD_REQUIRED");
  if (id === "agents.create" && (input.instance_id !== undefined || input.model !== undefined || input.effort !== undefined) &&
    (!input.instance_id || !input.model)) throw new PrimitiveInputError("PRIMITIVE_MODEL_PAIR_REQUIRED");
  if (id === "agents.update" && Object.keys(input).length === 1) throw new PrimitiveInputError("PRIMITIVE_EMPTY_PATCH");
  if (id === "channels.update" && Object.keys(input).length === 1) throw new PrimitiveInputError("PRIMITIVE_EMPTY_PATCH");
  if (id === "channels.create" || id === "channels.update") {
    if (input.default_responder?.kind === "member" && Array.isArray(input.member_ids) &&
      !input.member_ids.includes(input.default_responder.bot_id)) throw new PrimitiveInputError("PRIMITIVE_RESPONDER_NOT_MEMBER");
  }
  return { def, args: Object.freeze({ ...input }) };
}
