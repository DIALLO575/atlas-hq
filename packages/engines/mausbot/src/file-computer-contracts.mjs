import { mausbotRequest, MausbotAdapterError } from "./adapter.mjs";
import { nativePrimitive, planNativePrimitive } from "../../../engine-core/src/native-capabilities.mjs";

/**
 * M0.6 preconnection: HTTP metadata projections and isolated binary transfer
 * plans. There is no public BFF registration, browser credential relay, desktop
 * control, raw file fetch, screenshot, computer command, or running worker.
 */
export const COMPUTER_METADATA_READS = Object.freeze([
  "computer.usage", "computer.local.status", "browser.sites",
]);
export const COMPUTER_MUTATION_PLANS = Object.freeze([
  "browser.sign-out", "computer.local.run", "computer.local.start",
  "computer.local.stop", "computer.local.remove",
]);
export const FILE_TRANSFER_PLANS = Object.freeze([
  "files.thread.export", "files.message.image", "files.message.file",
  "files.attachments.create", "files.files.create",
]);
export class FileComputerContractError extends Error {
  constructor(code) { super(code); this.code=code; this.status=400; this.name="FileComputerContractError"; }
}
const fail = code => { throw new FileComputerContractError(code); };
const plain=x=>x!==null&&typeof x==="object"&&!Array.isArray(x);
const ident=x=>typeof x==="string"&&/^[a-zA-Z0-9_-]{1,120}$/.test(x);
const uuid=x=>typeof x==="string"&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(x);
const site=x=>typeof x==="string"&&/^[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?$/.test(x)&&
  !x.includes("..")&&!x.startsWith(".")&&!x.endsWith(".");
const fileName=x=>typeof x==="string"&&/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,119}$/.test(x)&&!x.includes("..");
const smallInt=(x,max)=>Number.isSafeInteger(x)&&x>=0&&x<=max;
const positive=(x,max)=>smallInt(x,max)&&x>0;
const record=x=>{if(!plain(x))throw new MausbotAdapterError("COMPUTER_METADATA_INVALID",502);return x;};
function allowed(input,fields,required=fields) {
  if(!plain(input))fail("FILE_COMPUTER_INPUT_INVALID");
  if(Object.keys(input).some(k=>!fields.includes(k)))fail("FILE_COMPUTER_FIELD_FORBIDDEN");
  if(required.some(k=>!Object.hasOwn(input,k)))fail("FILE_COMPUTER_FIELD_REQUIRED");
}
function nativePath(name,ids={}) {
  try{return planNativePrimitive(name,ids).path;}catch{return fail("FILE_COMPUTER_PATH_INVALID");}
}
function browserTarget(input,requireSite=false) {
  const keys=["bot","profile","threadId",...(requireSite?["site"]:[])];
  allowed(input,keys,requireSite?["site"]:[]);
  const hasBot="bot" in input,hasProfile="profile" in input;
  if(hasBot===hasProfile || (hasBot&&!ident(input.bot)) || (hasProfile&&!ident(input.profile)) ||
    ("threadId" in input&&!ident(input.threadId)) ||
    (hasProfile&&"threadId" in input))fail("BROWSER_TARGET_INVALID");
  if(requireSite&&!site(input.site))fail("BROWSER_SITE_INVALID");
}
export function planFileComputerRead(name,input={}) {
  if(!COMPUTER_METADATA_READS.includes(name) || nativePrimitive(name)?.method!=="GET")
    fail("COMPUTER_READ_UNKNOWN");
  if(name==="browser.sites")browserTarget(input);
  else allowed(input,[]);
  let path=nativePath(name);
  if(name==="browser.sites"){
    const query=new URLSearchParams([[("bot" in input)?"bot":"profile",input.bot??input.profile]]);
    if("threadId" in input)query.set("threadId",input.threadId);
    path+="?"+query;
  }
  return Object.freeze({primitive:name,method:"GET",path,projection:"metadata-only",
    requiresOwnerOrAdmin:true,requiresRuntimeOwnershipCheck:true,
    callable:false,released:false,hostTested:false});
}
export async function executeFileComputerRead(config,name,input={},deps={}) {
  const plan=planFileComputerRead(name,input);
  const data=record(await mausbotRequest(config,plan.path,deps));
  const meta={primitive:name,untrusted:true,projection:"metadata-only"};
  switch(name){
    case "computer.usage":
      if(!smallInt(data.teamComputers,100000)||
        (data.cloudComputers!==null&&!smallInt(data.cloudComputers,100000)))
        throw new MausbotAdapterError("COMPUTER_METADATA_INVALID",502);
      return {...meta,teamComputers:data.teamComputers,cloudComputers:data.cloudComputers};
    case "computer.local.status":
      return {...meta,ready:data.ready===true,managed:data.managed===true,
        container:["running","stopped","missing","starting","unknown"].includes(data.container)?
          data.container:"unknown"};
    case "browser.sites":
      if(!Array.isArray(data.sites)||data.sites.length>200)throw new MausbotAdapterError("COMPUTER_METADATA_INVALID",502);
      return {...meta,running:data.running===true,siteCount:data.sites.length,
        // Site domains can reveal private accounts/organizations: never copy them.
        entriesWithCookies:data.sites.filter(s=>plain(s)&&positive(s.cookies,1000000)).length};
    default:fail("COMPUTER_READ_UNKNOWN");
  }
}
/** All mutations require a separate durable, HUMAN approval and ownership check. */
export function planFileComputerMutation(name,input={}) {
  if(!COMPUTER_MUTATION_PLANS.includes(name)||nativePrimitive(name)?.method!=="POST")
    fail("COMPUTER_ACTION_UNKNOWN");
  let body={};
  if(name==="browser.sign-out"){
    browserTarget(input,true);
    body={...("bot" in input?{bot:input.bot}:{profile:input.profile}),
      ...("threadId" in input?{threadId:input.threadId}:{}),site:input.site};
  }else allowed(input,[]);
  return Object.freeze({primitive:name,method:"POST",path:nativePath(name),
    body:Object.freeze(body),requiresHumanApproval:true,requiresOwnerOrAdmin:true,
    requiresRealActorSession:true,requiresRuntimeOwnershipCheck:true,
    requiresDurableAudit:true,requiresCostReview:name==="computer.local.run",
    requiresDestructiveConfirmation:name==="computer.local.remove",
    retryPolicy:"never-automatic",callable:false,hostTested:false,released:false});
}
const MIME={
  "application/pdf":".pdf","text/plain":".txt","text/markdown":".md",
  "text/csv":".csv","application/json":".json","application/rtf":".rtf",
};
const IMAGES=new Set(["image/png","image/jpeg","image/gif","image/webp"]);
/**
 * Byte-transfer PLANS, never JSON response adapters. The future worker must
 * own the upload UUID and stream the bytes with bounded limits. A download
 * requires a verified workspace/thread/message ownership binding.
 */
export function planMausbotFileTransfer(name,input={}) {
  if(!FILE_TRANSFER_PLANS.includes(name))fail("FILE_TRANSFER_UNKNOWN");
  let method, path,headers={},direction,requiresByteStream=true;
  if(name==="files.thread.export"){
    allowed(input,["threadId"]);
    if(!ident(input.threadId))fail("FILE_THREAD_INVALID");
    method="GET";direction="download";
    path=nativePath(name,{threadId:input.threadId})+"?format=markdown";
  }else if(name==="files.message.image"){
    allowed(input,["threadId","messageId"]);
    if(!ident(input.threadId)||!ident(input.messageId))fail("FILE_MESSAGE_INVALID");
    method="GET";direction="download";
    path=nativePath(name,{threadId:input.threadId,messageId:input.messageId});
  }else if(name==="files.message.file"){
    // Generic POST /file with a user-supplied path is NOT supported.
    // Only the GET image preview reference granted by the stored message.
    allowed(input,["threadId","messageId","ref"]);
    if(!ident(input.threadId)||!ident(input.messageId)||!smallInt(input.ref,100))
      fail("FILE_PREVIEW_INVALID");
    method="GET";direction="download";
    path=nativePath(name,{threadId:input.threadId,messageId:input.messageId})+
      "?preview=1&ref="+input.ref;
  }else{
    allowed(input,name==="files.files.create"?
      ["uploadId","mime","bytes","name"]:["uploadId","mime","bytes"]);
    if(!uuid(input.uploadId))fail("FILE_UPLOAD_ID_INVALID");
    const max=name==="files.attachments.create"?10*1024*1024:25*1024*1024;
    if(!positive(input.bytes,max))fail("FILE_UPLOAD_BYTES_INVALID");
    if(name==="files.attachments.create"&&!IMAGES.has(input.mime))
      fail("FILE_IMAGE_MIME_INVALID");
    if(name==="files.files.create"&&
      (!(input.mime in MIME)||!fileName(input.name)||!input.name.toLowerCase().endsWith(MIME[input.mime])))
      fail("FILE_MIME_NAME_INVALID");
    method="POST";direction="upload";
    const query=new URLSearchParams({uploadId:input.uploadId.toLowerCase()});
    if(name==="files.files.create")query.set("name",input.name);
    path=nativePath(name)+"?"+query;
    headers={"Content-Type":input.mime,"Content-Length":String(input.bytes)};
  }
  return Object.freeze({primitive:name,method,path,direction,headers:Object.freeze(headers),
    requiresByteStream,requiresWorker:true,requiresWorkspaceAuthorization:true,
    requiresThreadOwnership:name.startsWith("files.thread")||name.startsWith("files.message"),
    requiresDurableAudit:true,requiresHumanApproval:true,
    zeroRawBytesInJson:true,callable:false,hostTested:false,released:false});
}
