import { mausbotRequest, MausbotAdapterError } from "./adapter.mjs";

/** Source: OpenMausBot shared/today.ts, server/routes/today.ts (GET /api/needs-you).
 * These are NOT approval decisions. Use the engine's viewer-scoped response
 * only after explicit human verification of the token -> person mapping.
 */
export const MAUSBOT_NEEDS_YOU_KINDS = Object.freeze([
  "signed-out", "usage-limit", "out-of-credit", "connection", "place", "question",
]);
const titles = Object.freeze({
  "signed-out": "Session moteur à reconnecter",
  "usage-limit": "Limite d’utilisation atteinte",
  "out-of-credit": "Crédit du moteur insuffisant",
  connection: "Application à reconnecter",
  place: "Environnement à vérifier",
  question: "Question d’un agent",
});
const record = value => value !== null && typeof value === "object" && !Array.isArray(value);
const limited = (value,max) => typeof value==="string" ? value.trim().slice(0,max) : "";
const safeId = value => typeof value==="string" && /^[A-Za-z0-9_-]{1,120}$/.test(value);
const safeEventId = value => typeof value==="string" && /^[A-Za-z0-9_:-]{1,160}$/.test(value);
const fail = () => {throw new MausbotAdapterError("MAUSBOT_NEEDS_YOU_INVALID",502);};

export function normalizeMausbotNeedsYou(payload) {
  if (!record(payload) || !Array.isArray(payload.items) || payload.items.length>300) fail();
  const seen = new Set();
  const items=[];
  for(const input of payload.items) {
    if(!record(input) || !MAUSBOT_NEEDS_YOU_KINDS.includes(input.kind) ||
       !safeEventId(input.id) || !Number.isSafeInteger(input.at) || input.at<0 || input.at>8_640_000_000_000_000) fail();
    if(!Array.isArray(input.botIds) && input.kind!=="question") fail();
    if(input.kind==="question" && !safeId(input.botId)) fail();
    const botIds=input.kind==="question" ? [input.botId] : input.botIds;
    if(!Array.isArray(botIds) || botIds.length>32 || !botIds.every(safeId)) fail();
    if(input.threadId !== undefined && !safeId(input.threadId)) fail();
    if(input.kind === "question" && !safeId(input.threadId)) fail();
    if(input.kind === "connection" && typeof input.app !== "string") fail();
    if(input.kind === "signed-out" && !safeId(input.instanceId)) fail();
    // Never reflect raw place records, credit objects, credential fields, or
    // external URLs into ATLAS. Only a bounded human-visible question follows.
    const key=input.kind+"\u0000"+input.id;
    if(seen.has(key)) continue;
    seen.add(key);
    const item={
      id:input.id,kind:input.kind,at:input.at,title:titles[input.kind],
      botIds:[...new Set(botIds)],
      ...(safeId(input.threadId)?{threadId:input.threadId}:{}),
      ...(input.kind==="connection"?{app:limited(input.app,64)}:{}),
      ...(input.kind==="question"?{text:limited(input.text,320)}:{}),
    };
    items.push(item);
  }
  // The upstream endpoint is viewer-filtered and current, not a full historical feed.
  items.sort((a,b)=>b.at-a.at);
  return {source:"live-read-only",mode:"needs-you",canApprove:false,canDispatch:false,
    windowDays:7,items:items.slice(0,100)};
}
export async function readMausbotNeedsYou(config,deps={}) {
  const result=await mausbotRequest(config,"/api/needs-you",deps);
  return normalizeMausbotNeedsYou(result);
}
