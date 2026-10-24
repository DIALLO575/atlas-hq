import { planNativePrimitive, nativePrimitive } from "../../../engine-core/src/native-capabilities.mjs";
import { NativePrimitiveInputError } from "./native-read.mjs";

/**
 * Offline, approval-required mutation contracts. These functions do not open
 * network connections and MUST NOT be interpreted as human approval receipts.
 * Payloads may contain sensitive text: do not log them or return them to the UI.
 */
export const NATIVE_MUTATION_PLANS = Object.freeze([
  "memory.bot.write-index",
  "memory.bot.write-file",
  "memory.bot.delete-file",
  "memory.bot.reviewed",
  "memory.bot.tidy",
  "skills.bot.update",
  "skills.library.update",
  "skills.bot.library-update",
  "memory.team.patch-entry",
  "memory.team.delete-entry",
  "memory.section.update",
]);
const plain = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const isId = (v) => typeof v === "string" && /^[A-Za-z0-9_-]{1,120}$/.test(v);
const section = (v) => typeof v === "string" && v.length <= 60 && /^[\p{L}\p{N} _&().-]*$/u.test(v);
const skillId = (v) => typeof v === "string" && /^[a-z0-9-]{1,80}$/.test(v);
const hash = (v) => typeof v === "string" && /^[a-f0-9]{64}$/i.test(v);
const pathPattern = /^(?:MEMORY\.md|memory\/[A-Za-z0-9][A-Za-z0-9_-]{0,79}\.md|memory\/log\/[A-Za-z0-9][A-Za-z0-9_-]{0,79}\.md)$/;
const reasonableText = (v,bytes) => typeof v === "string" && Buffer.byteLength(v,"utf8") <= bytes;
function problem(code) { throw new NativePrimitiveInputError(code); }
const allFields = {
  "memory.bot.write-index": ["botId","text"],
  "memory.bot.write-file": ["botId","path","text","expectedHash"],
  "memory.bot.delete-file": ["botId","path"],
  "memory.bot.reviewed": ["botId","token"],
  "memory.bot.tidy": ["botId"],
  "skills.bot.update": ["botId","skillId","enabled"],
  "skills.library.update": ["skillId","enabled"],
  "skills.bot.library-update": ["botId","skills"],
  "memory.team.patch-entry": ["entryId","section","expectedRevision","name","detail","pinned","accept"],
  "memory.team.delete-entry": ["entryId","section","expectedRevision"],
  "memory.section.update": ["section","text"],
};
const requiredFields = {
  "memory.bot.write-index": ["botId","text"],
  "memory.bot.write-file": ["botId","path","text","expectedHash"],
  "memory.bot.delete-file": ["botId","path"],
  "memory.bot.reviewed": ["botId","token"],
  "memory.bot.tidy": ["botId"],
  "skills.bot.update": ["botId","skillId","enabled"],
  "skills.library.update": ["skillId","enabled"],
  "skills.bot.library-update": ["botId","skills"],
  "memory.team.patch-entry": ["entryId","section","expectedRevision"],
  "memory.team.delete-entry": ["entryId","section","expectedRevision"],
  "memory.section.update": ["section","text"],
};
function validInputs(name,v) {
  const fields = allFields[name], required = requiredFields[name];
  if (!fields || !plain(v)) problem("NATIVE_MUTATION_UNKNOWN");
  if (Object.keys(v).some(k=>!fields.includes(k))) problem("NATIVE_MUTATION_FIELD_NOT_ALLOWED");
  if (required.some(k=>!(k in v))) problem("NATIVE_MUTATION_FIELD_REQUIRED");
  for (const key of Object.keys(v)) {
    const value = v[key];
    if (["botId","entryId"].includes(key) && !isId(value)) problem("NATIVE_MUTATION_ID_INVALID");
    if (key === "skillId" && !skillId(value)) problem("NATIVE_MUTATION_SKILL_INVALID");
    if (key === "section" && !section(value)) problem("NATIVE_MUTATION_SECTION_INVALID");
    if (key === "path" && (typeof value !== "string" || !pathPattern.test(value))) problem("NATIVE_MUTATION_PATH_INVALID");
    if (key === "expectedHash" && !hash(value)) problem("NATIVE_MUTATION_HASH_INVALID");
    if (key === "expectedRevision" && (!isId(value))) problem("NATIVE_MUTATION_REVISION_INVALID");
    if (key === "token" && !hash(value)) problem("NATIVE_MUTATION_TOKEN_INVALID");
    if (["enabled","pinned","accept"].includes(key) && typeof value !== "boolean") problem("NATIVE_MUTATION_BOOL_REQUIRED");
    if (key === "text" && !reasonableText(value,name==="memory.section.update"?24000:32000)) problem("NATIVE_MUTATION_TEXT_INVALID");
    if (["name","detail"].includes(key) && !reasonableText(value,key==="name"?120:4000)) problem("NATIVE_MUTATION_TEXT_INVALID");
    if (key === "skills" && (!Array.isArray(value) || value.length>200 ||
      value.some(s=>!skillId(s)) || new Set(value).size!==value.length)) problem("NATIVE_MUTATION_SKILLS_INVALID");
  }
  if (name==="memory.team.patch-entry" && !["name","detail","pinned","accept"].some(k=>k in v))
    problem("NATIVE_MUTATION_EMPTY_PATCH");
  return v;
}

/**
 * Preview-only command with explicit approval requirement. Without a persisted
 * human approval, an implementation MUST reject it; 'approved: true' client
 * fields are intentionally not accepted.
 */
export function planMausbotNativeMutation(name, input) {
  if (!NATIVE_MUTATION_PLANS.includes(name)) problem("NATIVE_MUTATION_UNKNOWN");
  const args = validInputs(name,input);
  const placeholders = Object.fromEntries(["botId","skillId","entryId"].filter(k=>k in args).map(k=>[k,args[k]]));
  const native = planNativePrimitive(name,placeholders);
  const qs = new URLSearchParams();
  const body = {};
  for (const [key,value] of Object.entries(args)) {
    if (["botId","skillId","entryId"].includes(key)) continue;
    if (key==="section" && (name.startsWith("memory.team.") || name==="memory.section.update")) qs.set("section",value);
    else if (key==="path" && name==="memory.bot.delete-file") qs.set("path",value);
    else if (key==="expectedRevision" && name==="memory.team.delete-entry") qs.set("revision",value);
    else if (key==="skills") body.skills=value;
    else if (key==="expectedRevision") body.expectedRevision=value;
    else body[key]=value;
  }
  // DELETE /memory/file has no if-match mechanism in MAUSBOT; never retry automatically.
  const nonIdempotent = ["memory.bot.delete-file","memory.bot.tidy","memory.team.delete-entry"].includes(name);
  const path = native.path + (qs.size?"?"+qs.toString():"");
  return Object.freeze({
    primitive: name, method:native.method, path, body:Object.freeze(body),
    requiresHumanApproval:true, requiresDurableAudit:true,
    requiresOwnerOrAdmin:true, retryPolicy:nonIdempotent?"never-auto":"manual-with-revalidation",
    callable:false, hostTested:false, released:false,
    sensitivity:"contains-potentially-private-input",
  });
}
