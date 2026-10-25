/**
 * Notion view metadata read projection; filters and grouping criteria stay
 * provider-side. The parent database and data source are independently checked
 * to prevent a view ID from escaping the resource the actor selected.
 */
import { safeNotionUrl } from "./resource-view.mjs";
const UUID=/^(?:[a-f0-9]{32}|[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})$/i;
const TYPES=new Set(["table","board","calendar","timeline","gallery","list",
  "form","chart","map","dashboard"]);
const valid=x=>typeof x==="string"&&UUID.test(x);
const same=(a,b)=>valid(a)&&valid(b)&&
  a.toLowerCase().replaceAll("-","")===b.toLowerCase().replaceAll("-","");
const reject=()=>{throw Object.assign(new Error("NOTION_VIEW_SCOPE_MISMATCH"),
  {code:"NOTION_VIEW_SCOPE_MISMATCH"});};
export function projectNotionViewMetadata(raw,{
  viewId,sourceKind,resourceId,
}={}) {
  if(!raw||raw.object!=="view"||!same(raw.id,viewId)||
     !["database","data_source"].includes(sourceKind)||!valid(resourceId)||
     !raw.parent||raw.parent.type!=="database_id"||
     !valid(raw.parent.database_id)||!TYPES.has(raw.type)||
     (raw.type==="dashboard"?raw.data_source_id!==null:
       !valid(raw.data_source_id)))reject();
  if(sourceKind==="database"&&!same(resourceId,raw.parent.database_id))reject();
  if(sourceKind==="data_source"&&!same(resourceId,raw.data_source_id))reject();
  const cleanText=typeof raw.name==="string" ? raw.name
    .replace(/(?:https?:\/\/|s3:\/\/|data:)[^\s<>"']+/gi,"[lien masqué]")
    .slice(0,160):"Vue Notion";
  const sorts=Array.isArray(raw.sorts)?raw.sorts:[];
  const quick=raw.quick_filters&&typeof raw.quick_filters==="object"&&
    !Array.isArray(raw.quick_filters)?Object.keys(raw.quick_filters):[];
  return {
    id:raw.id,name:cleanText,type:raw.type,
    url:safeNotionUrl(raw.url),
    databaseId:raw.parent.database_id,
    sourceId:raw.data_source_id??null,
    hasFilter:Boolean(raw.filter&&typeof raw.filter==="object"),
    sortCount:Math.min(sorts.length,100),
    quickFilterCount:Math.min(quick.length,100),
    hasGrouping:Boolean(raw.configuration?.group_by),
    layoutConfigured:Boolean(raw.configuration&&
      typeof raw.configuration==="object"),
  };
}
