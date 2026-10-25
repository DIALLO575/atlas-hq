import { safeNotionHostedUrl } from "./media-content.mjs";
/** Fixed, actor-bound media delivery primitives. No arbitrary URL fetches. */
const KINDS = new Set(["image","pdf","video","audio","file"]);
const MAX_BYTES = 4_000_000;
const MIME = new Map([
  ["image/jpeg",new Set(["image"])], ["image/png",new Set(["image"])],
  ["image/webp",new Set(["image"])],["image/gif",new Set(["image"])],
  ["image/avif",new Set(["image"])],["image/bmp",new Set(["image"])],
  ["application/pdf",new Set(["pdf","file"])],
  ["video/mp4",new Set(["video"])],["video/webm",new Set(["video"])],
  ["audio/mpeg",new Set(["audio"])],["audio/mp4",new Set(["audio"])],
  ["audio/wav",new Set(["audio"])],["audio/ogg",new Set(["audio"])],
  ["audio/webm",new Set(["audio"])],
  ["text/plain",new Set(["file"])],
  ["application/octet-stream",new Set(["file"])],
  ["application/zip",new Set(["file"])],
  ["application/msword",new Set(["file"])],
  ["application/vnd.openxmlformats-officedocument.wordprocessingml.document",new Set(["file"])],
  ["application/vnd.ms-excel",new Set(["file"])],
  ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",new Set(["file"])],
  ["application/vnd.ms-powerpoint",new Set(["file"])],
  ["application/vnd.openxmlformats-officedocument.presentationml.presentation",new Set(["file"])],
]);
export class NotionMediaError extends Error {
  constructor(code) { super(code); this.name="NotionMediaError"; this.code=code; }
}
function mediaError(code) { throw new NotionMediaError(code); }
export function notionHostedMediaSource(block, now=Date.now()) {
  if (!block || block.object!=="block" || !KINDS.has(block.type) ||
      !block[block.type] || block[block.type].type!=="file") mediaError("NOT_AVAILABLE");
  const data=block[block.type].file;
  const url=safeNotionHostedUrl(data?.url,data?.expiry_time,now);
  if(!url) mediaError("NOT_AVAILABLE");
  return Object.freeze({url,kind:block.type});
}
export async function fetchNotionHostedMedia(source, {
  request=fetch, timeoutMs=8000, maxBytes=MAX_BYTES,
}={}) {
  if (!source || !KINDS.has(source.kind) || typeof source.url!=="string" ||
      !Number.isInteger(maxBytes)||maxBytes<1024||maxBytes>MAX_BYTES||
      !Number.isInteger(timeoutMs)||timeoutMs<500||timeoutMs>15000||
      typeof request!=="function") mediaError("INVALID_REQUEST");
  // A URL is accepted only if it was read live from a Notion block.
  // SSRF validation is repeated here to prevent bypass through future callers.
  const parsed=new URL(source.url);
  if(parsed.protocol!=="https:" || parsed.username || parsed.password ||
     parsed.port || parsed.hash ||
     !(parsed.hostname==="files.notion.so" ||
       parsed.hostname==="secure.notion-static.com" ||
       parsed.hostname==="prod-files-secure.s3.us-west-2.amazonaws.com" ||
       (["s3.us-west-2.amazonaws.com","s3.amazonaws.com"].includes(parsed.hostname) &&
        parsed.pathname.startsWith("/secure.notion-static.com/")))) mediaError("INVALID_REQUEST");
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),timeoutMs);
  try {
    let response;
    try { response=await request(source.url,{
      method:"GET",cache:"no-store",redirect:"error",
      signal:controller.signal,referrerPolicy:"no-referrer",
      headers:{Accept:"*/*"},
    }); } catch { mediaError("PROVIDER_UNAVAILABLE"); }
    if(!response || response.status!==200 || !response.ok) mediaError("PROVIDER_UNAVAILABLE");
    const kind=source.kind;
    const header=response.headers?.get?.("content-type")||"";
    const mime=header.split(";")[0].trim().toLowerCase();
    if(!MIME.get(mime)?.has(kind)) mediaError("UNSUPPORTED_MEDIA");
    const length=response.headers?.get?.("content-length");
    if(length!==null && (!/^\d+$/.test(length) || Number(length)>maxBytes)) mediaError("MEDIA_TOO_LARGE");
    const chunks=[];let bytes=0;
    if(response.body && typeof response.body.getReader==="function"){
      const reader=response.body.getReader();
      try {
        while(true){
          const data=await reader.read();
          if(data.done)break;
          bytes+=data.value.byteLength;
          if(bytes>maxBytes) {
            try {await reader.cancel();}catch{}
            mediaError("MEDIA_TOO_LARGE");
          }
          chunks.push(data.value);
        }
      } catch(e) {
        if(e instanceof NotionMediaError)throw e;
        mediaError("PROVIDER_UNAVAILABLE");
      }
    } else {
      let raw;
      try {raw=new Uint8Array(await response.arrayBuffer());}
      catch{mediaError("PROVIDER_UNAVAILABLE");}
      if(raw.byteLength>maxBytes)mediaError("MEDIA_TOO_LARGE");
      bytes=raw.length;chunks.push(raw);
    }
    const output=new Uint8Array(bytes);let at=0;
    for(const chunk of chunks){output.set(chunk,at);at+=chunk.byteLength;}
    return { bytes:output,mime,disposition:kind==="file"?"attachment":"inline" };
  } finally { clearTimeout(timeout); }
}
