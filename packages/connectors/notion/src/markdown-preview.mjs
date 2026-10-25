/**
 * Notion Markdown v1 safe, lossy preview. NEVER return provider markdown:
 * Notion embeds expiring signed media URLs inside raw Markdown.
 */
const UUID=/^(?:[a-f0-9]{32}|[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})$/i;
const valid=id=>typeof id==="string"&&UUID.test(id);
const same=(a,b)=>valid(a)&&valid(b)&&a.toLowerCase().replaceAll("-","")===b.toLowerCase().replaceAll("-","");
const error=()=>{throw Object.assign(new Error("NOTION_MARKDOWN_INVALID_RESPONSE"),
  {code:"NOTION_MARKDOWN_INVALID_RESPONSE"});};
const MEDIA=/^\s*(?:!\[|<(?:image|file|pdf|video|audio|page|database|unknown|custom-block)\b)/i;
const URL=/(?:https?:\/\/|s3:\/\/|file:\/\/|ftp:\/\/|data:)[^\s<>"']+/gi;
const TAG=/<\s*\/?[a-z][^>]*>/i;
function safeLine(source) {
  const line=source.slice(0,8192);
  if(MEDIA.test(line))return "⟦Média ou élément Notion non affiché⟧";
  if(TAG.test(line)||/<\s*\/?[a-z][^>]*$/i.test(line))
    return "⟦Bloc enrichi non affiché⟧";
  return line
    .replace(/!?\[([^\]\n]{0,160})\]\(([^)\n]{0,4096})\)/g,
      (_all,label)=>String(label).slice(0,160))
    .replace(/<[^>\n]{0,4096}>/g,"⟦élément⟧")
    .replace(URL,"[lien masqué]")
    .replace(/(?:X-Amz-|AWSAccessKeyId=|Signature=|token=|sig=)[a-z0-9_%=+&/.-]*/gi,"[paramètre masqué]")
    .slice(0,900);
}
function classify(line,inCode) {
  if(inCode)return "code";
  if(/^#{1,4}\s/.test(line))return "heading";
  if(/^\s*>\s?/.test(line))return "quote";
  if(/^\s*[-*]\s+\[[ xX]\]\s/.test(line))return "task";
  if(/^\s*(?:[-*+]\s+|\d+[.)]\s+)/.test(line))return "list";
  if(/^\s*---+\s*$/.test(line))return "divider";
  return "paragraph";
}
export function projectNotionMarkdown(raw,requestedId,{maxLines=100,maxCharacters=12000}={}) {
  if(!raw||raw.object!=="page_markdown"||!same(raw.id,requestedId)||
     typeof raw.markdown!=="string"||raw.markdown.length>64000||
     typeof raw.truncated!=="boolean"||!Array.isArray(raw.unknown_block_ids)||
     raw.unknown_block_ids.length>1000||raw.unknown_block_ids.some(x=>!valid(x))||
     !Number.isInteger(maxLines)||maxLines<1||maxLines>160||
     !Number.isInteger(maxCharacters)||maxCharacters<200||maxCharacters>16000)
    error();
  const lines=raw.markdown.replace(/\r\n?/g,"\n").split("\n");
  const out=[];let used=0;let code=false;
  for(const line of lines){
    if(out.length>=maxLines||used>=maxCharacters)break;
    const fence=/^\s*(?:\x60{3,}|~{3,})/.test(line);
    const kind=fence?"divider":classify(line,code);
    let text=fence?"⟦délimiteur de code⟧":safeLine(line);
    if(used+text.length>maxCharacters)text=text.slice(0,maxCharacters-used);
    used+=text.length;
    out.push({kind,text});
    if(fence)code=!code;
  }
  return Object.freeze({version:"v1",format:"notion-enhanced-markdown",
    lines:out,truncated:raw.truncated||lines.length>out.length,
    unknownCount:raw.unknown_block_ids.length,lossy:true,
    mediaLinksSuppressed:true});
}
