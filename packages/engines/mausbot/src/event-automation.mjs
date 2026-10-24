import { mausbotRequest, MausbotAdapterError } from "./adapter.mjs";
import { nativePrimitive, planNativePrimitive } from "../../../engine-core/src/native-capabilities.mjs";

/** Offline M0.5 primitives. Never registered as a public BFF action. */
export const EVENT_AUTOMATION_READS = Object.freeze([
  "webhooks.list", "routines.list", "notifications.list", "jobs.snapshot",
]);
export const EVENT_AUTOMATION_PLANS = Object.freeze([
  "webhooks.test", "webhooks.rotate", "webhooks.update", "webhooks.delete",
  "routines.update", "routines.run", "notifications.read", "notifications.read-all",
]);
export class EventAutomationContractError extends Error {
  constructor(code) { super(code); this.code = code; this.status = 400; this.name = "EventAutomationContractError"; }
}
const bad = code => { throw new EventAutomationContractError(code); };
const rec = x => x !== null && typeof x === "object" && !Array.isArray(x);
const str = (x, max=120) => typeof x === "string" ? x.slice(0,max) : null;
const id = x => typeof x === "string" && /^[A-Za-z0-9_-]{1,120}$/.test(x);
const num = x => Number.isSafeInteger(x) && x>=0 ? x : null;
const count = (x,max) => {
  if (!Array.isArray(x) || x.length>max) throw new MausbotAdapterError("MAUSBOT_EVENT_RESPONSE_INVALID",502);
  return x;
};
function obj(x) {
  if (!rec(x)) throw new MausbotAdapterError("MAUSBOT_EVENT_RESPONSE_INVALID",502);
  return x;
}
function check(x,keys,required=keys) {
  if (!rec(x)) bad("EVENT_INPUT_INVALID");
  if (Object.keys(x).some(k=>!keys.includes(k))) bad("EVENT_FIELD_FORBIDDEN");
  if (required.some(k=>!Object.hasOwn(x,k))) bad("EVENT_FIELD_REQUIRED");
}
function route(name,ids={}) {
  try{return planNativePrimitive(name,ids).path;}catch{return bad("EVENT_ROUTE_INVALID");}
}

/** No arbitrary query strings or waiting sockets at planning time. */
export function planEventAutomationRead(name,input={}) {
  if (!EVENT_AUTOMATION_READS.includes(name) || nativePrimitive(name)?.method!=="GET") bad("EVENT_READ_UNKNOWN");
  if(name==="jobs.snapshot") {
    check(input,["threadId","since","version","wait"],["threadId"]);
    if(!id(input.threadId)) bad("EVENT_THREAD_INVALID");
    if("since" in input && !Number.isSafeInteger(input.since)) bad("EVENT_SINCE_INVALID");
    if("since" in input && input.since<0) bad("EVENT_SINCE_INVALID");
    if("version" in input && (typeof input.version!=="string"||! /^[A-Za-z0-9_-]{1,64}$/.test(input.version))) bad("EVENT_VERSION_INVALID");
    // Long-polling in Vercel is NOT enabled. The eventual worker can wait <=25s.
    if("wait" in input && (!Number.isSafeInteger(input.wait)||input.wait<0||input.wait>25000))bad("EVENT_WAIT_INVALID");
    const query=new URLSearchParams({scope:"job"});
    for(const k of ["since","version","wait"])if(k in input)query.set(k,String(input[k]));
    return Object.freeze({primitive:name,method:"GET",
      path:route(name,{threadId:input.threadId})+"?"+query,
      mode:"metadata-only",callerMustAuthorizeThread:true,
      callable:false,released:false,hostTested:false});
  }
  check(input,[]);
  return Object.freeze({primitive:name,method:"GET",path:route(name),
    mode:"metadata-only",callerMustAuthorizeThread:false,
    callable:false,released:false,hostTested:false});
}

/** Safely project state, never webhook credential, prompts, job results, questions or notification bodies. */
export async function executeEventAutomationRead(config,name,input={},deps={}) {
  const plan=planEventAutomationRead(name,input);
  const response=obj(await mausbotRequest(config,plan.path,deps));
  const meta={primitive:name,mode:"metadata-only",untrusted:true};
  switch(name) {
    case "webhooks.list":
      return {...meta,webhooks:count(response.webhooks,200).map(item=>{
        const a=obj(item);return {id:str(a.id),enabled:a.enabled===true,
          delivery:a.delivery==="post"?"post":"run",runOn:str(a.runOn,24),
          deliveryCount:num(a.deliveryCount),verificationPending:a.verificationPending===true,
          lastReceivedAt:num(a.lastReceivedAt)};
      }),attemptCount:count(response.attempts??[],2000).length,
      ingressAvailable:response.ingress?.available===true};
    case "routines.list":
      return {...meta,routines:count(response.routines,500).map(item=>{
        const a=obj(item);return {id:str(a.id),enabled:a.enabled===true,
          target:a.target==="room"?"room":"bot",when:str(a.when,40),lastRunAt:num(a.lastRunAt)};
      }),runs:count(response.runs,1000).map(item=>{
        const a=obj(item);return {id:str(a.id),routineId:str(a.routineId),
          status:str(a.status,32),startedAt:num(a.startedAt),finishedAt:num(a.finishedAt)};
      })};
    case "notifications.list":
      return {...meta,notifications:count(response.notifications,1000).map(item=>{
        const a=obj(item);return {id:str(a.id),kind:str(a.kind,40),
          at:num(a.at),read:a.read===true};
      })};
    case "jobs.snapshot": {
      const states=new Set(["running","needs-input","completed","failed","stalled","idle"]);
      if(!states.has(response.state)||typeof response.version!=="string"||response.version.length>120
        ||response.threadId!==input.threadId)
        throw new MausbotAdapterError("MAUSBOT_EVENT_RESPONSE_INVALID",502);
      const nodes=count(response.nodes,500);
      const needsInput=count(response.needsInput,500);
      const tallies=obj(response.counts);
      const required=["queued","running","waiting","needsInput","completed","failed","cancelled"];
      if(required.some(key=>num(tallies[key])===null))
        throw new MausbotAdapterError("MAUSBOT_EVENT_RESPONSE_INVALID",502);
      return {...meta,threadId:input.threadId,state:response.state,
        version:str(response.version,120),since:num(response.since),
        observedAt:num(response.now),
        nodeCount:nodes.length,needsInputCount:needsInput.length,
        counts:Object.fromEntries(["queued","running","waiting","needsInput","completed","failed","cancelled"]
          .map(key=>[key,num(tallies[key])])),
        // A job in needs-input/failed/stalled must never be reported as success.
        requiresAttention:["needs-input","failed","stalled"].includes(response.state),
        confirmedComplete:response.state==="completed" && num(tallies.failed)===0
          && num(tallies.cancelled)===0};
    }
    default:bad("EVENT_READ_UNKNOWN");
  }
}
export function planEventAutomationMutation(name,input={}) {
  if(!EVENT_AUTOMATION_PLANS.includes(name) || nativePrimitive(name)?.method==="GET")bad("EVENT_ACTION_UNKNOWN");
  let ids={},body;
  switch(name) {
    case "webhooks.test":
      check(input,["webhookId"]);
      if(!id(input.webhookId))bad("EVENT_WEBHOOK_INVALID");
      ids={webhookId:input.webhookId};
      body={event:"openmaus.test",message:"ATLAS verification only"};
      break;
    case "webhooks.rotate":
    case "webhooks.delete":
      check(input,["webhookId"]);
      if(!id(input.webhookId))bad("EVENT_WEBHOOK_INVALID");
      ids={webhookId:input.webhookId};
      break;
    case "webhooks.update":
      check(input,["webhookId","enabled"]);
      if(!id(input.webhookId)||typeof input.enabled!=="boolean")bad("EVENT_WEBHOOK_INVALID");
      ids={webhookId:input.webhookId};body={enabled:input.enabled};break;
    case "routines.update":
      check(input,["routineId","enabled"]);
      if(!id(input.routineId)||typeof input.enabled!=="boolean")bad("EVENT_ROUTINE_INVALID");
      ids={routineId:input.routineId};body={enabled:input.enabled};break;
    case "routines.run":
      check(input,["routineId"]);
      if(!id(input.routineId))bad("EVENT_ROUTINE_INVALID");
      ids={routineId:input.routineId};break;
    case "notifications.read":
      check(input,["notificationId"]);
      if(!id(input.notificationId))bad("EVENT_NOTIFICATION_INVALID");
      ids={notificationId:input.notificationId};break;
    case "notifications.read-all":
      check(input,[]);break;
    default:bad("EVENT_ACTION_UNKNOWN");
  }
  const spec=nativePrimitive(name);
  return Object.freeze({primitive:name,method:spec.method,path:route(name,ids),
    ...(body?{body:Object.freeze(body)}:{}),
    requiresHumanApproval:true,requiresWorkspaceAuthorization:true,
    requiresResourceOwnership:true,requiresDurableAudit:true,
    retryPolicy:"never-automatic",callable:false,hostTested:false,released:false,
    mayContainSecretInUpstreamResult:name==="webhooks.rotate"});
}
/** Validate cursor format only. It must ultimately be obtained from the engine's own stream. */
export function planMausbotEventReplay(cursor=null) {
  if(cursor!==null && (typeof cursor!=="string"||cursor.length<1||cursor.length>300 ||
    /[\r\n\x00-\x1f]/.test(cursor)))bad("EVENT_CURSOR_INVALID");
  return Object.freeze({path:"/api/events",method:"GET",
    headers:cursor===null?{}:{"Last-Event-ID":cursor},
    requiresDurableCursorStore:true,requiresDedupe:true,
    requiresResyncOnReplayGap:true,requiresWorker:true,
    callable:false,hostTested:false,released:false});
}
/** Offline event reconciliation state, never a substitute for durable outbox/cursor persistence. */
export function reconcileMausbotEvent(state,event) {
  if(!rec(state)||!rec(event))bad("EVENT_RECONCILE_INVALID");
  const last=state.cursor??null;
  if(last!==null && (typeof last!=="string"||last.length>300))bad("EVENT_RECONCILE_INVALID");
  const kind=event.kind;
  if(kind==="hello"&&event.requiresResync===true)
    return Object.freeze({cursor:last,requiresResync:true,duplicate:false,accepted:false});
  const cursor=event.cursor;
  if(typeof cursor!=="string"||!cursor||cursor.length>300 ||
     /[\r\n\x00-\x1f]/.test(cursor))bad("EVENT_CURSOR_INVALID");
  if(cursor===last) return Object.freeze({cursor:last,requiresResync:false,duplicate:true,accepted:false});
  // Cursor order is opaque; same-ID dedup only. A durable ledger is still required.
  return Object.freeze({cursor,requiresResync:false,duplicate:false,accepted:true});
}
