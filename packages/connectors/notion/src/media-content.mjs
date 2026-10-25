/**
 * SHA-136 / SHA-140: bounded rich document projection. Server only.
 * This file never returns Notion-hosted signed file URLs to the browser.
 */
const UUID = /^(?:[a-f0-9]{32}|[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})$/i;
const MEDIA = new Set(["image","pdf","video","audio","file"]);
const TEXT = new Set(["paragraph","heading_1","heading_2","heading_3","heading_4",
  "quote","callout","bulleted_list_item","numbered_list_item","to_do",
  "toggle","code","equation","child_page","child_database","bookmark",
  "embed","link_preview","table_row","synced_block","divider",
  "column","column_list","table","table_of_contents","breadcrumb",
  "meeting_notes","transcription","unsupported"]);
const NESTED = new Set(["bulleted_list_item","numbered_list_item","callout",
  "toggle","column","column_list","table","synced_block","quote",
  "heading_1","heading_2","heading_3","heading_4","to_do"]);
const MAX_TEXT = 1400;
export function validNotionId(value) { return typeof value === "string" && UUID.test(value); }
export function safeExternalUrl(value) {
  if (typeof value !== "string" || value.length > 2000) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.port ||
        url.hash || !url.hostname || url.hostname === "localhost" ||
        /^\d+\.\d+\.\d+\.\d+$/.test(url.hostname) ||
        url.hostname.endsWith(".localhost") || url.hostname.endsWith(".local")) return null;
    return url.toString();
  } catch { return null; }
}
/** Strict fixed provider-host allowlist; never a user-supplied fetch origin. */
export function safeNotionHostedUrl(value, expiry, now = Date.now()) {
  if (typeof value !== "string" || value.length > 4096 ||
      typeof expiry !== "string" || !Number.isFinite(Date.parse(expiry)) ||
      Date.parse(expiry) - now < 30_000) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.port ||
        url.hash) return null;
    const host = url.hostname.toLowerCase();
    const allowed = host === "files.notion.so" ||
      host === "secure.notion-static.com" ||
      host === "prod-files-secure.s3.us-west-2.amazonaws.com" ||
      ((host === "s3.us-west-2.amazonaws.com" || host === "s3.amazonaws.com") &&
       url.pathname.startsWith("/secure.notion-static.com/"));
    return allowed ? url.toString() : null;
  } catch { return null; }
}
const trimmed = (value, max) => typeof value === "string" ?
  value.slice(0,max) : "";
function richText(parts, length = MAX_TEXT) {
  return Array.isArray(parts) ? parts.slice(0,30).map(p =>
    typeof p?.plain_text === "string" ? p.plain_text :
    typeof p?.text?.content === "string" ? p.text.content : "").join("").slice(0,length) : "";
}

/**
 * Whitelisted spans only: never forward mention.user, email, raw annotations,
 * unsafe hrefs, or rich text objects to the browser.
 */
export function projectNotionRichText(parts, length=MAX_TEXT) {
  if(!Array.isArray(parts) || !Number.isInteger(length) ||
     length<0 || length>MAX_TEXT) return [];
  let remaining=length;
  const output=[];
  for(const part of parts.slice(0,30)){
    if(remaining<=0)break;
    if(!part || typeof part!=="object")continue;
    const type=["text","mention","equation"].includes(part.type) ?
      part.type:"text";
    const value=typeof part.plain_text==="string" ? part.plain_text :
      type==="equation" ? part.equation?.expression :
      type==="text" ? part.text?.content : "";
    if(typeof value!=="string" || !value)continue;
    const text=value.slice(0,remaining);
    remaining-=text.length;
    const flags=part.annotations && typeof part.annotations==="object" ?
      part.annotations : {};
    output.push({
      text,kind:type,href:safeExternalUrl(part.href ?? part.text?.link?.url),
      bold:flags.bold===true,italic:flags.italic===true,
      underline:flags.underline===true,strikethrough:flags.strikethrough===true,
      code:flags.code===true,
    });
  }
  return output;
}

function mediaDescriptor(type, body, now) {
  if (!body || typeof body !== "object") return null;
  const caption = richText(body.caption, 240);
  if (body.type === "file" && safeNotionHostedUrl(body.file?.url,body.file?.expiry_time,now)) {
    return { kind:type, origin:"notion", mode:"proxy", caption,
      filename:trimmed(body.name,160), href:null };
  }
  if (body.type === "external") {
    const href = safeExternalUrl(body.external?.url);
    return { kind:type, origin:"external", mode:href?"link":"unavailable",
      caption, filename:trimmed(body.name,160), href };
  }
  return { kind:type, origin:body.type === "file_upload"?"upload":"unavailable",
    mode:"unavailable", caption, filename:trimmed(body.name,160), href:null };
}
/** Limit and whiten fields even when provider adds new block types or secrets. */
export function projectNotionBlock(item, { now = Date.now() } = {}) {
  if (!item || item.object !== "block" || !validNotionId(item.id) ||
      typeof item.type !== "string" || item.type.length > 60) return null;
  const type = MEDIA.has(item.type) || TEXT.has(item.type) ? item.type : "unsupported";
  const body = item[type] && typeof item[type] === "object" ? item[type] : {};
  const media = MEDIA.has(type) ? mediaDescriptor(type, body, now) : null;
  const link = ["bookmark","embed","link_preview"].includes(type)
    ? safeExternalUrl(body.url) : null;
  const text = type === "child_page" || type === "child_database" ?
    trimmed(body.title,180) : type === "equation" ?
      trimmed(body.expression,MAX_TEXT) : richText(body.rich_text,MAX_TEXT);
  const cells = type === "table_row" && Array.isArray(body.cells) ?
    body.cells.slice(0,12).map(cell=>richText(cell,500)) : [];
  const segments = type === "equation" ? [{
    text,kind:"equation",href:null,bold:false,italic:false,
    underline:false,strikethrough:false,code:true,
  }] : projectNotionRichText(body.rich_text);
  const tableHeaders = type==="table" ? {
    column:body.has_column_header===true,
    row:body.has_row_header===true,
  } : null;
  return {
    id:item.id, type, text, media, link, cells, segments, tableHeaders,
    language:type==="code"?trimmed(body.language,40):null,
    checked:type==="to_do"?body.checked === true:null,
    hasChildren:item.has_children === true,
    children:[],
    childrenTruncated:item.has_children === true,
  };
}
/**
 * Bounded first-page-of-each-parent traversal. Does not follow child_page,
 * child_database, synced duplicate pointers, or arbitrary links.
 * Requires caller to pass an actor/workspace checked client.
 */
export async function collectNotionDocument(client, pageId, {
  maxDepth = 2, maxNodes = 40, maxRequests = 8, pageSize = 30,
  startCursor = null, signal, now = Date.now(),
} = {}) {
  if (!validNotionId(pageId) ||
      !Number.isInteger(maxDepth) || maxDepth < 0 || maxDepth > 3 ||
      !Number.isInteger(maxNodes) || maxNodes < 1 || maxNodes > 60 ||
      !Number.isInteger(maxRequests) || maxRequests < 1 || maxRequests > 10 ||
      !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 40 ||
      (startCursor!==null && (typeof startCursor!=="string" ||
        !startCursor || startCursor.length>2048 || /[\u0000-\u001f\u007f]/.test(startCursor)))) {
    throw Object.assign(new Error("INVALID_INPUT"), { code:"INVALID_INPUT" });
  }
  if (!client || typeof client.listBlockChildren !== "function") {
    throw Object.assign(new Error("INVALID_INPUT"), { code:"INVALID_INPUT" });
  }
  let nodes=0;
  let requests=0;
  const visited=new Set([pageId.toLowerCase().replaceAll("-","")]);
  async function visit(blockId,depth) {
    if(requests>=maxRequests || nodes>=maxNodes)
      return {blocks:[],partial:true};
    requests++;
    const size=Math.min(pageSize,maxNodes-nodes);
    const page=await client.listBlockChildren(blockId,{
      size,signal,startCursor:depth===0?startCursor:null,
    });
    if(!page || !Array.isArray(page.results) || typeof page.has_more!=="boolean" ||
       (page.has_more && !page.next_cursor))throw new Error("NOTION_INVALID_RESPONSE");
    let partial=page.has_more;
    const nextCursor=depth===0 && page.has_more ? page.next_cursor : null;
    const blocks=[];
    for(const entry of page.results.slice(0,size)){
      if(nodes>=maxNodes){partial=true;break;}
      const block=projectNotionBlock(entry,{now});
      if(!block)continue;
      const normalized=block.id.toLowerCase().replaceAll("-","");
      if(visited.has(normalized)){partial=true;continue;}
      visited.add(normalized);
      nodes++;
      if(block.hasChildren && depth<maxDepth && NESTED.has(block.type) &&
         requests<maxRequests && nodes<maxNodes){
        const nested=await visit(block.id,depth+1);
        block.children=nested.blocks;
        block.childrenTruncated=nested.partial;
        if(nested.partial)partial=true;
      }else if(block.hasChildren){
        block.childrenTruncated=true;
        partial=true;
      }
      blocks.push(block);
    }
    if(page.results.length>size)partial=true;
    return {blocks,partial,nextCursor};
  }
  const root=await visit(pageId,0);
  return {blocks:root.blocks,truncated:root.partial,hasMore:Boolean(root.nextCursor),
    nextCursor:root.nextCursor??null,requests,nodes};
}
