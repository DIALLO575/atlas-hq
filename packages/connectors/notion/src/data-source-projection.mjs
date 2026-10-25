/**
 * Server-only Notion data source/browser projections.
 * Never serialize raw provider pages, formula expressions, people or file URLs.
 */
import { safeNotionUrl } from "./resource-view.mjs";
const UUID=/^(?:[a-f0-9]{32}|[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})$/i;
const TYPES=new Set(["title","rich_text","number","select","multi_select","status",
  "date","checkbox","formula","relation","rollup","people","files","url",
  "email","phone_number","created_time","last_edited_time","created_by",
  "last_edited_by","unique_id","button","verification","place","id"]);
const fail=()=>{throw Object.assign(new Error("NOTION_INVALID_RESPONSE"),
  {code:"NOTION_INVALID_RESPONSE"});};
const valid=id=>typeof id==="string"&&UUID.test(id);
const equal=(a,b)=>valid(a)&&valid(b)&&
  a.toLowerCase().replaceAll("-","")===b.toLowerCase().replaceAll("-","");
function text(value,max=160) {
  if(typeof value!=="string")return "";
  // Read data can itself contain a URL with signature credentials.
  return value.replace(/(?:https?:\/\/|s3:\/\/|data:)[^\s<>"']+/gi,"[lien masqué]")
    .replace(/(?:X-Amz-|AWSAccessKeyId=|Signature=|token=|sig=)[a-z0-9_%=+&/.-]*/gi,"[paramètre masqué]")
    .slice(0,max);
}
const rich=(parts,max=160)=>Array.isArray(parts)?
  text(parts.slice(0,15).map(p=>typeof p?.plain_text==="string"?p.plain_text:
    typeof p?.text?.content==="string"?p.text.content:"").join(""),max):"";
function typeOf(value) {
  return TYPES.has(value?.type)?value.type:"unsupported";
}
function nameOf(value,key) {
  return text(typeof value?.name==="string"?value.name:key,100)||"Sans nom";
}
function optionsOf(value,type) {
  const opts=value?.[type]?.options;
  return Array.isArray(opts)?
    opts.slice(0,12).map(o=>text(o?.name,80)).filter(Boolean):[];
}
export function projectNotionDatabaseSources(raw,requestedId) {
  if(!raw||raw.object!=="database"||!equal(raw.id,requestedId) ||
      !Array.isArray(raw.data_sources))fail();
  const results=[];
  const seen=new Set();
  for(const source of raw.data_sources.slice(0,30)) {
    if(!valid(source?.id))continue;
    const id=source.id.toLowerCase().replaceAll("-","");
    if(seen.has(id))continue;
    seen.add(id);
    results.push({id:source.id,name:text(source.name,150)||"Source Notion"});
  }
  return {databaseId:requestedId,results,truncated:raw.data_sources.length>30};
}
export function projectNotionDataSourceSchema(raw,requestedId) {
  if(!raw||raw.object!=="data_source"||!equal(raw.id,requestedId)||
      !raw.properties||typeof raw.properties!=="object"||
      Array.isArray(raw.properties))fail();
  const props=Object.entries(raw.properties);
  const sorted=props.sort(([a,p],[b,q])=>{
    const pa=p?.type==="title"?0:1;const pb=q?.type==="title"?0:1;
    return pa-pb||a.localeCompare(b);
  });
  const columns=sorted.slice(0,14).map(([key,p])=>({
    name:nameOf(p,key),key:text(key,100),type:typeOf(p),
    options:["status","select","multi_select"].includes(p?.type)?
      optionsOf(p,p.type):[],
  })).filter(c=>c.name && c.key);
  return {dataSourceId:requestedId,columns,truncated:props.length>14,
    propertyCount:props.length};
}
function dateValue(d) {
  if(!d||typeof d!=="object")return "";
  const start=text(d.start,60),end=text(d.end,60);
  return [start,end].filter(Boolean).join(" → ");
}
function oneProperty(p,type) {
  if(!p||typeof p!=="object")return "";
  switch(type){
    case "title":return rich(p.title);
    case "rich_text":return rich(p.rich_text);
    case "number":return typeof p.number==="number"&&Number.isFinite(p.number)?
      String(p.number).slice(0,60):"";
    case "select":case "status":return text(p[type]?.name,120);
    case "multi_select":return Array.isArray(p.multi_select)?
      p.multi_select.slice(0,6).map(s=>text(s?.name,45)).filter(Boolean).join(" · "):"";
    case "date":return dateValue(p.date);
    case "checkbox":return p.checkbox===true?"Oui":p.checkbox===false?"Non":"";
    case "formula": {
      const f=p.formula;
      if(!f||typeof f!=="object")return "";
      if(f.type==="string")return text(f.string,160);
      if(f.type==="number")return typeof f.number==="number"&&Number.isFinite(f.number)?
        String(f.number).slice(0,60):"";
      if(f.type==="boolean")return f.boolean===true?"Oui":f.boolean===false?"Non":"";
      if(f.type==="date")return dateValue(f.date);
      return "Formule non affichable";
    }
    case "relation":return Array.isArray(p.relation)?
      p.relation.length+" relation(s)":"Relation non accessible";
    case "rollup":{
      const value=p.rollup;
      if(!value||typeof value!=="object")return "Non disponible";
      if(value.type==="number")return typeof value.number==="number"&&Number.isFinite(value.number)?
        String(value.number).slice(0,60):"";
      if(value.type==="date")return dateValue(value.date);
      if(value.type==="array")return Array.isArray(value.array)?
        value.array.length+" élément(s)":"Non disponible";
      return "Agrégation non affichable";
    }
    case "people":return Array.isArray(p.people)?p.people.length+" personne(s)":"";
    case "files":return Array.isArray(p.files)?p.files.length+" fichier(s)":"";
    case "created_time":case "last_edited_time":return text(p[type],60);
    case "unique_id":return typeof p.unique_id?.number==="number"?
      text((p.unique_id?.prefix??"")+p.unique_id.number,60):"";
    case "url":return p.url?"Lien externe masqué":"";
    case "email":case "phone_number":return p[type]?"Donnée personnelle masquée":"";
    case "created_by":case "last_edited_by":return p[type]?"Utilisateur masqué":"";
    case "button":return "Action désactivée";
    case "verification":return "Statut de vérification";
    case "place":return "Lieu";
    default:return "Type non affichable";
  }
}
export function projectNotionDataSourceRows(raw,sourceId,schema,{
  maxRows=15,
}={}) {
  if(!valid(sourceId)||!schema||!equal(schema.dataSourceId,sourceId)||
      !Array.isArray(schema.columns)||schema.columns.length>14||
      !Number.isInteger(maxRows)||maxRows<1||maxRows>20||
      !raw||!Array.isArray(raw.results)||typeof raw.has_more!=="boolean"||
      (raw.has_more&&(typeof raw.next_cursor!=="string"||
        !raw.next_cursor||raw.next_cursor.length>2048)))fail();
  const results=[];
  for(const item of raw.results.slice(0,maxRows)){
    if(item?.object!=="page"||!valid(item.id))continue;
    if(item.parent?.type==="data_source_id" &&
       !equal(item.parent.data_source_id,sourceId))continue;
    if(item.parent?.type==="database_id"&&
       valid(item.parent.database_id)) {
      // Legacy pages may have a database parent; still scoped by provider query.
    } else if(item.parent?.type && item.parent.type!=="data_source_id")continue;
    const properties=item.properties;
    if(!properties||typeof properties!=="object"||Array.isArray(properties))continue;
    const cells=schema.columns.map(column=>{
      const prop=(Object.hasOwn(properties,column.key)?properties[column.key]:null)??
        Object.values(properties).find(p=>
        p?.id && p.id===column.key);
      return {name:column.name,value:text(oneProperty(prop,column.type),180)};
    });
    const titleCell=cells.find((v,i)=>schema.columns[i]?.type==="title");
    results.push({id:item.id,title:titleCell?.value||"Sans titre",
      url:safeNotionUrl(item.url),cells});
  }
  return {
    dataSourceId:sourceId,results,
    hasMore:raw.has_more,nextCursor:raw.next_cursor??null,
    truncated:schema.truncated===true || raw.results.length>maxRows,
    columns:schema.columns,
  };
}
