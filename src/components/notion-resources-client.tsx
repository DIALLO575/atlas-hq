"use client";
import { useEffect, useState, type FormEvent } from "react";
import { NotionCapabilitiesClient } from "./notion-capabilities-client";

type Connection = { id: string; workspaceId: string; label: string };
type ResourceFilter="all"|"page"|"database";
type NotionPhoneScreen="library"|"reader"|"views"|"access";
type WorkSection="projects"|"meetings"|"tasks"|"docs";
type SectionBinding={id:string;kind:Resource["kind"];viewId?:string};
const workSections:{id:WorkSection;label:string;icon:string;hint:string}[]=[
  {id:"projects",label:"Projets",icon:"▦",hint:"Choisissez votre base de projets, puis sa vue de projets actifs."},
  {id:"meetings",label:"Réunions",icon:"◷",hint:"Choisissez votre base ou votre page de réunions."},
  {id:"tasks",label:"Tâches",icon:"☑",hint:"Choisissez votre base de tâches et sa vue Notion."},
  {id:"docs",label:"Documentation",icon:"▤",hint:"Choisissez la page ou la base de votre documentation."},
];
const resourceFilters:{id:ResourceFilter;label:string}[]=[
  {id:"all",label:"Tout"},{id:"page",label:"Pages"},
  {id:"database",label:"Bases"},
];
const resourceLabels:Record<Resource["kind"],string>={
  page:"Page",database:"Base",data_source:"Source de données",
};
type Resource = { id: string; kind: "page" | "database" | "data_source";
  title: string; editedAt: string | null; url: string | null };
type ViewMetadata={id:string;name:string;type:string;databaseId:string;
  sourceId:string|null;hasFilter:boolean;sortCount:number;quickFilterCount:number;
  hasGrouping:boolean;layoutConfigured:boolean;url:string|null};
type NativeView = { id: string; name: string; type: string;
  url: string | null; editedAt: string | null;
  metadata?: ViewMetadata };
type Media = { kind: "image" | "pdf" | "video" | "audio" | "file";
  origin: "notion" | "external" | "upload" | "unavailable";
  mode: "proxy" | "link" | "unavailable"; caption: string; filename: string; href: string | null };
type RichSegment = {text:string;kind:"text"|"mention"|"equation";href:string|null;
  bold:boolean;italic:boolean;underline:boolean;strikethrough:boolean;code:boolean};
type Block = { id: string; type: string; text: string; hasChildren: boolean;
  childrenTruncated: boolean; children: Block[]; media: Media | null;
  link: string | null; language: string | null; cells: string[]; checked: boolean | null;
  segments: RichSegment[]; tableHeaders: {column:boolean;row:boolean}|null };
type MarkdownLine={kind:"code"|"heading"|"quote"|"task"|"list"|"divider"|"paragraph";text:string};
type MarkdownPreview={version:"v1";format:"notion-enhanced-markdown";
  lines:MarkdownLine[];truncated:boolean;unknownCount:number;lossy:true;
  mediaLinksSuppressed:true};
type SourceRef = { id:string;name:string };
type SourceColumn = { name:string;key:string;type:string;options:string[] };
type SourceRow = { id:string;title:string;url:string|null;
  cells:Array<{name:string;value:string}> };
type SourceResult = { dataSourceId:string;columns:SourceColumn[];
  results:SourceRow[];hasMore:boolean;nextCursor:string|null;truncated:boolean };
type DocumentPreview = { blocks: Block[]; truncated: boolean; nodes: number;
  requests: number; hasMore:boolean;nextCursor:string|null };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const types: Record<string, string> = {
  table: "Tableau", board: "Kanban", calendar: "Calendrier",
  timeline: "Chronologie", gallery: "Galerie", list: "Liste",
  form: "Formulaire", chart: "Graphique", map: "Carte",
  dashboard: "Dashboard", unknown: "Vue",
};
function date(value: string | null) {
  if (!value) return "—";
  const time = Date.parse(value);
  return Number.isFinite(time) ? new Intl.DateTimeFormat("fr", {
    day: "numeric", month: "short", year: "numeric",
  }).format(time) : "—";
}
function providerMessage(status: number, code: string | null = null) {
  if (status === 403 || status === 404) return "Ressource non accessible avec les droits Notion actuels.";
  if (status === 409) return "Connexion à renouveler ou actualisation déjà en cours.";
  if (status === 429) return "Notion limite les requêtes. Réessayez plus tard.";
  // The server deliberately returns only safe error codes, never Notion tokens,
  // private URLs, provider JSON or vault details.
  const diagnostic = code && /^notion-[a-z-]{1,70}$/.test(code) ? code : "HTTP-" + status;
  if (status === 503) return "Lecture Notion indisponible (" + diagnostic +
    "). Vérifiez la configuration du connecteur ou réessayez.";
  if (status === 502) return "Réponse inattendue de Notion (" + diagnostic +
    "). Réessayez ou signalez ce code.";
  return "Lecture Notion impossible (" + diagnostic + "). Réessayez.";
}
async function responseFailure(response: Response) {
  let code: string | null = null;
  try {
    const value: unknown = await response.json();
    if (value && typeof value === "object" && "error" in value &&
        typeof value.error === "string" && /^notion-[a-z-]{1,70}$/.test(value.error)) {
      code = value.error;
    }
  } catch { /* Malformed or non-JSON errors remain a generic HTTP status. */ }
  return new Error(providerMessage(response.status, code));
}
async function readEndpoint(path: "read" | "views" | "data" | "capabilities", values: Record<string,string>) {
  const response = await fetch("/api/apps/notion/" + path + "?" +
    new URLSearchParams(values), { credentials: "same-origin", cache: "no-store" });
  if (!response.ok) throw await responseFailure(response);
  const data: unknown = await response.json();
  if (!data || typeof data !== "object") throw new Error("Réponse Notion invalide.");
  return data as Record<string, unknown>;
}
function resourceList(value: unknown): Resource[] {
  if (!Array.isArray(value)) throw new Error("Liste Notion invalide.");
  return value.filter((item): item is Resource => Boolean(item &&
    typeof item === "object" && UUID.test(item.id ?? "") &&
    ["page", "database", "data_source"].includes(item.kind) &&
    typeof item.title === "string"));
}
function nativeViews(value: unknown): NativeView[] {
  if (!Array.isArray(value)) throw new Error("Liste de vues invalide.");
  return value.filter((item): item is NativeView => Boolean(item &&
    typeof item === "object" && UUID.test(item.id ?? "") &&
    typeof item.name === "string" && typeof item.type === "string"));
}



function NotionRichText({segments,text}:{segments:RichSegment[];text:string}) {
  if(!segments.length)return <>{text}</>;
  return <>{segments.map((part,i)=>{
    const content=part.kind==="equation" || part.code ?
      <code className="nt-segment-code">{part.text}</code> : part.text;
    const linked=part.href ? <a href={part.href} rel="noopener noreferrer"
      target="_blank">{content}</a> : content;
    return <span key={i} className={[
      part.bold?"nt-segment-bold":"",part.italic?"nt-segment-italic":"",
      part.underline?"nt-segment-under":"",part.strikethrough?"nt-segment-strike":"",
      part.kind==="mention"?"nt-segment-mention":"",
    ].filter(Boolean).join(" ")}>{linked}</span>;
  })}</>;
}

function NotionDocumentBlock({ block, binding, depth = 0 } : {
  block: Block; binding: { workspaceId: string; connectionId: string }; depth?: number;
}) {
  const url="/api/apps/notion/media?"+new URLSearchParams({
    ...binding, blockId:block.id,
  });
  const label=block.media?.filename || block.media?.caption ||
    (block.media?.kind === "pdf" ? "Document PDF" : "Média Notion");
  const media=block.media;
  const mediaNames:Record<Media["kind"],string>={
    image:"Image",pdf:"Document PDF",video:"Vidéo",audio:"Audio",file:"Fichier",
  };
  const mediaSymbols:Record<Media["kind"],string>={
    image:"▧",pdf:"▤",video:"▶",audio:"♫",file:"⇩",
  };
  const isTable=block.type==="table";
  const children=isTable ? block.children.filter(c=>c.type==="table_row") : block.children;
  return <div className={"nt-rich-block nt-rich-"+block.type+(media?" nt-rich-block-media":"")} style={{marginLeft: depth ? 12:0}}>
    {media ? <figure className="nt-rich-media">
      <div className="nt-media-header">
        <span className="nt-media-symbol" aria-hidden="true">{mediaSymbols[media.kind]}</span>
        <div className="nt-media-heading"><strong>{mediaNames[media.kind]}</strong>
          <small>{media.filename || media.caption || "Fichier associé à cette page"}</small>
        </div>
        <span className="nt-media-origin">{media.origin==="notion"?"Notion":"Externe"}</span>
      </div>
      {media.mode==="proxy" && media.kind==="image" &&
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={label} loading="lazy" referrerPolicy="no-referrer"/>}
      {media.mode==="proxy" && media.kind==="video" &&
        <video controls preload="none" src={url} aria-label={label}/>}
      {media.mode==="proxy" && media.kind==="audio" &&
        <audio controls preload="none" src={url} aria-label={label}/>}
      {media.mode==="proxy" && ["pdf","file"].includes(media.kind) &&
        <a href={url} target="_blank" rel="noopener noreferrer">
          {media.kind==="pdf" ? "Consulter le PDF" : "Télécharger le fichier"} · {label} ↗
        </a>}
      {media.mode==="link" && media.href &&
        <a href={media.href} target="_blank" rel="noopener noreferrer">
          Ouvrir le média externe · {label} ↗</a>}
      {media.mode==="unavailable" &&
        <p className="nt-muted">Aperçu indisponible ou fichier trop volumineux. Consultez la page originale dans Notion.</p>}
      {media.caption && <figcaption>{media.caption}</figcaption>}
    </figure> : <>
      {block.type==="to_do" ? <label className="nt-rich-todo">
        <input type="checkbox" checked={block.checked===true} readOnly disabled/>
        <span><NotionRichText segments={block.segments??[]} text={block.text}/></span></label> :
        block.type==="code" ? <pre className="nt-rich-code"><code>{block.text}</code></pre> :
        block.type==="divider" ? <hr/> :
        block.type==="table_row" ? <div className="nt-rich-cells">{block.cells.join(" · ")}</div> :
        block.text ? <p className="nt-rich-text">
          <NotionRichText segments={block.segments??[]} text={block.text}/>
        </p> : null}
      {block.link && <a href={block.link} target="_blank"
        rel="noopener noreferrer" className="nt-link-button">Ouvrir le lien ↗</a>}
    </>}
    {isTable && children.length>0 ? <div className="nt-rich-table">
      <table><tbody>{children.map((tableRow,rowIndex)=><tr key={tableRow.id}>
        {tableRow.cells.map((cell,columnIndex)=>
          block.tableHeaders?.column && rowIndex===0 ?
            <th key={columnIndex} scope="col">{cell}</th> :
          block.tableHeaders?.row && columnIndex===0 ?
            <th key={columnIndex} scope="row">{cell}</th> :
            <td key={columnIndex}>{cell}</td>)}
      </tr>)}</tbody></table>
    </div> : !isTable && children.map(child=><NotionDocumentBlock key={child.id}
      block={child} binding={binding} depth={depth+1}/>)}
    {block.childrenTruncated && <small className="nt-muted">
      Sous-contenu non entièrement affiché · consulter Notion</small>}
  </div>;
}

function NotionExplorer({ connection }: { connection: Connection }) {
  const { workspaceId, id: connectionId } = connection;
  const binding = { workspaceId, connectionId };
  const [workSection,setWorkSection]=useState<WorkSection>("projects");
  const [sectionBindings,setSectionBindings]=useState<Partial<Record<WorkSection,SectionBinding>>>({});
  const [bindingsReady,setBindingsReady]=useState(false);
  const sectionStorageKey="atlas:notion:sections:"+workspaceId+":"+connectionId;
  const sectionInfo=workSections.find(section=>section.id===workSection)!;
  useEffect(()=>{
    let active=true;
    void Promise.resolve().then(()=>{
    if(!active)return;
    try{
      const value=JSON.parse(sessionStorage.getItem(sectionStorageKey)??"{}");
      const clean:Partial<Record<WorkSection,SectionBinding>>={};
      for(const section of workSections){
        const item=value?.[section.id];
        if(item && UUID.test(item.id??"") && ["page","database","data_source"].includes(item.kind))
          clean[section.id]={id:item.id,kind:item.kind,...(UUID.test(item.viewId??"")?{viewId:item.viewId}:{})};
      }
      setSectionBindings(clean);
    }catch{ /* Storage is optional; provider permissions remain server-enforced. */ }
    setBindingsReady(true);
    });
    return ()=>{active=false;};
  },[sectionStorageKey]);
  useEffect(()=>{
    if(bindingsReady){
      try{sessionStorage.setItem(sectionStorageKey,JSON.stringify(sectionBindings));}catch{}
    }
  },[bindingsReady,sectionBindings,sectionStorageKey]);
  const [query, setQuery] = useState("");
  const [resourceFilter,setResourceFilter]=useState<ResourceFilter>("all");
  const [mobileScreen,setMobileScreen]=useState<NotionPhoneScreen>("library");
  const [documentMode,setDocumentMode]=useState<"document"|"markdown">("document");
  const [resources, setResources] = useState<Resource[]>([]);
  const [resourceCursor, setResourceCursor] = useState<string | null>(null);
  const [selected, setSelected] = useState<Resource | null>(null);
  const [views, setViews] = useState<NativeView[]>([]);
  const [viewCursor, setViewCursor] = useState<string | null>(null);
  const [currentView, setCurrentView] = useState<NativeView | null>(null);
  const [preview, setPreview] = useState<{results:Resource[];totalCount:number|null;
    hasMore:boolean;metadata:ViewMetadata|null;queryReleased:boolean}|null>(null);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [sourceRefs, setSourceRefs] = useState<SourceRef[]>([]);
  const [sourceColumns, setSourceColumns] = useState<SourceColumn[]>([]);
  const [sourceRows, setSourceRows] = useState<SourceRow[]>([]);
  const [sourceCursor, setSourceCursor] = useState<string|null>(null);
  const [sourceLimited, setSourceLimited] = useState(false);
  const [markdownPreview, setMarkdownPreview] = useState<MarkdownPreview|null>(null);
  const [documentPartial, setDocumentPartial] = useState(false);
  const [documentCursor, setDocumentCursor] = useState<string | null>(null);
  const [activeSourceId,setActiveSourceId]=useState<string|null>(null);
  const [showAccess,setShowAccess]=useState(false);
  const [operationError,setOperationError]=useState(false);
  const [permission, setPermission] = useState("");
  const [message, setMessage] = useState("Choisissez une ressource pour afficher son aperçu.");
  const [busy, setBusy] = useState("");
  const [disconnected, setDisconnected] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [loadError,setLoadError]=useState(false);
  const visibleResources=resourceFilter==="all"?resources:
    resources.filter(item=>resourceFilter==="database" ? item.kind!=="page" : item.kind===resourceFilter);


  // One initial title search per selected connection; never poll or prefetch
  // every workspace in the browser.
  useEffect(() => {
    const controller = new AbortController();
    async function initial() {
      setOperationError(false);setBusy("search");setLoadError(false);
      try {
        const response = await fetch("/api/apps/notion/read?" +
          new URLSearchParams({ workspaceId, connectionId, kind: "search", query: "" }),
          { credentials: "same-origin", cache: "no-store", signal: controller.signal });
        if (!response.ok) throw await responseFailure(response);
        const data = await response.json() as { results?: unknown; hasMore?: boolean; nextCursor?: unknown };
        if (!controller.signal.aborted) {
          const entries = resourceList(data.results);
          setResources(entries);setLoadError(false);
          setResourceCursor(data.hasMore && typeof data.nextCursor === "string" ? data.nextCursor : null);
          setMessage(entries.length ? "Choisissez une page ou une base pour explorer ses vues."
            : "Aucune ressource partagée détectée. Partagez une page ou une base avec la connexion dans Notion.");
        }
      } catch (error) { setOperationError(true);
        if (!controller.signal.aborted) {
          setLoadError(true);
          setMessage(error instanceof Error ? error.message : "Notion indisponible.");
        }
      } finally {
        if (!controller.signal.aborted) { setLoaded(true); setBusy(""); }
      }
    }
    void initial();
    return () => controller.abort();
  }, [workspaceId, connectionId]);

  function navigateMobile(screen:NotionPhoneScreen) {
    setMobileScreen(screen);
    if(typeof window!=="undefined" &&
       window.matchMedia("(max-width:840px)").matches) {
      document.getElementById("notion-explorer")?.scrollIntoView({
        block:"start",behavior:"instant",
      });
    }
  }

  async function search(more = false) {
    if (busy || disconnected) return;
    setOperationError(false);setBusy("search");
    try {
      const data = await readEndpoint("read", { ...binding, kind: "search", query: query.slice(0, 200),
        ...(more && resourceCursor ? { cursor: resourceCursor } : {}) });
      const entries = resourceList(data.results);
      setLoadError(false);
      setResources(previous => more ? [...previous, ...entries] : entries);
      setResourceCursor(data.hasMore === true && typeof data.nextCursor === "string" ? data.nextCursor : null);
      if (!more) {
        navigateMobile("library");
        setSelected(null); setViews([]); setCurrentView(null); setPreview(null); setSourceRefs([]); setSourceColumns([]); setSourceRows([]); setSourceCursor(null); setSourceLimited(false); setMarkdownPreview(null); setDocumentMode("document"); setBlocks([]); setDocumentPartial(false); setDocumentCursor(null);
      }
      setMessage(entries.length ? "Résultats autorisés chargés depuis Notion."
        : "Aucun résultat pour ce titre parmi les ressources partagées.");
    } catch (error) { setOperationError(true); setLoadError(true);setMessage(error instanceof Error ? error.message : "Notion indisponible."); }
    finally { setBusy(""); }
  }

  async function openSection(section:WorkSection) {
    if(busy || disconnected)return;
    setWorkSection(section);
    const saved=sectionBindings[section];
    if(saved){
      const resource=resources.find(item=>item.id===saved.id)??
        {id:saved.id,kind:saved.kind,title:workSections.find(item=>item.id===section)!.label,editedAt:null,url:null};
      await choose(resource,saved.viewId);
    }else{
      setSelected(null);setCurrentView(null);setPreview(null);setOperationError(false);
      navigateMobile("library");
    }
  }
  function assignResource(item:Resource) {
    setSectionBindings(previous=>({...previous,[workSection]:{id:item.id,kind:item.kind}}));
    void choose(item);
  }

  async function loadSourceRows(id:string) {
    const rows=await readEndpoint("data",{...binding,mode:"rows",resourceId:id}) as SourceResult;
    if(!Array.isArray(rows.columns)||!Array.isArray(rows.results))
      throw new Error("Tableau Notion invalide.");
    setActiveSourceId(id);setSourceColumns(rows.columns);setSourceRows(rows.results);
    setSourceCursor(rows.hasMore===true && typeof rows.nextCursor==="string"?rows.nextCursor:null);
    setSourceLimited(rows.truncated===true);
  }
  async function selectSource(id:string) {
    if(busy || disconnected)return;
    setOperationError(false);setBusy("rows");
    setActiveSourceId(null);setSourceRows([]);setSourceColumns([]);setSourceCursor(null);
    try{await loadSourceRows(id);}
    catch(error){setOperationError(true);setMessage(error instanceof Error?error.message:"Source indisponible.");}
    finally{setBusy("");}
  }

  async function choose(item: Resource, savedViewId?:string) {
    if (busy || disconnected) return;
    setSelected(item);navigateMobile("reader");
    setViews([]); setViewCursor(null); setCurrentView(null);
    setActiveSourceId(null);setSourceRefs([]);setSourceColumns([]);setSourceRows([]);
    setSourceCursor(null);setSourceLimited(false);
    setPreview(null); setMarkdownPreview(null); setDocumentMode("document"); setBlocks([]); setDocumentPartial(false); setDocumentCursor(null); setPermission("");
    setOperationError(false);setBusy("resource");
    try {
      if (item.kind === "page") {
        const data = await readEndpoint("read", {
          ...binding, kind: "document", resourceId: item.id,
        }) as DocumentPreview;
        if (!Array.isArray(data.blocks)) throw new Error("Document Notion invalide.");
        setBlocks(data.blocks.filter((block): block is Block => Boolean(
          block && typeof block === "object" && UUID.test(block.id ?? "") &&
          typeof block.type === "string" && typeof block.text === "string")));
        setDocumentPartial(data.truncated === true);
        setDocumentCursor(data.hasMore===true && typeof data.nextCursor==="string"?
          data.nextCursor:null);
        setMessage("Document chargé en lecture seule, y compris médias et sous-blocs autorisés.");
      } else {
        let contentError:string|null=null;
        if (item.kind === "database") {
          const found=await readEndpoint("data",{
            ...binding,mode:"discover",resourceId:item.id,
          });
          if(!Array.isArray(found.results))throw new Error("Sources Notion invalides.");
          const sources=found.results.filter((source):source is SourceRef=>
            Boolean(source && UUID.test(source.id??"") && typeof source.name==="string"));
          setSourceRefs(sources);setSourceLimited(found.truncated===true);
          if(sources[0]){
            try{await loadSourceRows(sources[0].id);}
            catch(error){contentError=error instanceof Error?error.message:"Contenu indisponible.";}
          }
        } else {
          await loadSourceRows(item.id);
        }
        // View discovery is independent: a provider restriction on views
        // should not hide authorized schema/rows from the user.
        try {
          const data=await readEndpoint("views",{
            ...binding,mode:"list",sourceKind:item.kind,resourceId:item.id,
          });
          const entries=nativeViews(data.results);
          setViews(entries);
          const savedView=entries.find(view=>view.id===savedViewId);
          if(savedView)await showView(savedView,item,false);
          setViewCursor(data.hasMore===true&&typeof data.nextCursor==="string"?
            data.nextCursor:null);
        }catch{
          setViews([]);setViewCursor(null);
        }
        if(contentError)setOperationError(true);
        setMessage(contentError??(item.kind==="database"?
          "Sources et vues de cette base chargées, selon les droits Notion.":
          "Colonnes, lignes et vues accessibles chargées en lecture seule."));
      }
    } catch (error) { setOperationError(true);
      setMessage(error instanceof Error ? error.message : "Ressource indisponible.");
    } finally { setBusy(""); }
  }



  async function showMarkdown() {
    if(busy || disconnected || selected?.kind!=="page")return;
    setDocumentMode("markdown");
    if(markdownPreview)return;
    setOperationError(false);setBusy("markdown");
    try {
      const data=await readEndpoint("read",{
        ...binding,kind:"markdown",resourceId:selected.id,
      }) as MarkdownPreview;
      if(data.version!=="v1" || data.lossy!==true ||
         data.mediaLinksSuppressed!==true || !Array.isArray(data.lines))
        throw new Error("Aperçu Markdown invalide.");
      const allowed=new Set(["code","heading","quote","task","list","divider","paragraph"]);
      const lines=data.lines.filter(item=>item && allowed.has(item.kind) &&
        typeof item.text==="string" && item.text.length<=900);
      setMarkdownPreview({...data,lines});
      setMessage("Markdown officiel v1 : aperçu filtré, fichiers et liens masqués.");
    }catch(error){ setOperationError(true);
      setMarkdownPreview(null);
      setMessage(error instanceof Error?error.message:"Markdown indisponible.");
    }finally{setBusy("");}
  }

  async function moreDocument() {
    if(busy || disconnected || selected?.kind!=="page" || !documentCursor)return;
    setOperationError(false);setBusy("document");
    try {
      const data=await readEndpoint("read",{
        ...binding,kind:"document",resourceId:selected.id,cursor:documentCursor,
      }) as DocumentPreview;
      if(!Array.isArray(data.blocks))throw new Error("Document Notion invalide.");
      const next=data.blocks.filter((item):item is Block=>Boolean(item &&
        typeof item==="object" && UUID.test(item.id??"") &&
        typeof item.type==="string" && typeof item.text==="string"));
      setBlocks(previous=>{
        const seen=new Set(previous.map(block=>block.id));
        const added=next.filter(block=>{
          if(seen.has(block.id))return false;
          seen.add(block.id);
          return true;
        });
        return [...previous,...added];
      });
      // An older nested section may still be partial after later pages load.
      setDocumentPartial(previous=>previous || data.truncated===true);
      setDocumentCursor(data.hasMore===true && typeof data.nextCursor==="string" &&
        data.nextCursor!==documentCursor ? data.nextCursor : null);
      setMessage("Suite de la page chargée à la demande.");
    }catch(error){ setOperationError(true);
      setMessage(error instanceof Error?error.message:"Suite du document indisponible.");
    }finally{setBusy("");}
  }


  async function moreSourceRows() {
    if(busy || disconnected || !activeSourceId || !sourceCursor)return;
    setOperationError(false);setBusy("rows");
    try{
      const current=sourceCursor;
      const data=await readEndpoint("data",{
        ...binding,mode:"rows",resourceId:activeSourceId,cursor:current,
      }) as SourceResult;
      if(!Array.isArray(data.results))throw new Error("Lignes Notion invalides.");
      setSourceRows(previous=>{
        const seen=new Set(previous.map(row=>row.id));
        const added=data.results.filter(row=>{
          if(!UUID.test(row?.id??"")||seen.has(row.id))return false;
          seen.add(row.id);
          return true;
        });
        return [...previous,...added];
      });
      setSourceCursor(data.hasMore===true && typeof data.nextCursor==="string" &&
        data.nextCursor!==current?data.nextCursor:null);
      setSourceLimited(previous=>previous||data.truncated===true);
      setMessage("Lignes suivantes chargées à la demande.");
    }catch(error){ setOperationError(true);
      setMessage(error instanceof Error?error.message:"Lignes Notion indisponibles.");
    }finally{setBusy("");}
  }

  async function moreViews() {
    if (busy || !selected || !viewCursor ||
      !["database", "data_source"].includes(selected.kind)) return;
    setOperationError(false);setBusy("views");
    try {
      const data = await readEndpoint("views", { ...binding, mode: "list",
        sourceKind: selected.kind, resourceId: selected.id, cursor: viewCursor });
      setViews(old => [...old, ...nativeViews(data.results)]);
      setViewCursor(data.hasMore === true && typeof data.nextCursor === "string" ? data.nextCursor : null);
    } catch (error) { setOperationError(true); setMessage(error instanceof Error ? error.message : "Vues indisponibles."); }
    finally { setBusy(""); }
  }

  async function showView(item: NativeView, scope:Resource|null=selected, remember=true) {
    if (busy || disconnected || !scope || scope.kind==="page") return;
    if(remember)setSectionBindings(previous=>previous[workSection]?.id===scope.id?
      {...previous,[workSection]:{...previous[workSection]!,viewId:item.id}}:previous);
    setCurrentView(item);navigateMobile("views");setPreview(null);setOperationError(false);setBusy("preview");
    try {
      const data = await readEndpoint("views", { ...binding, mode: "preview", viewId: item.id,
        sourceKind:scope.kind,resourceId:scope.id });
      setPreview({ results: resourceList(data.results),
        totalCount: typeof data.totalCount === "number" ? data.totalCount : null,
        hasMore: data.hasMore === true,
        metadata:data.metadata && typeof data.metadata==="object"?
          data.metadata as ViewMetadata:null,
        queryReleased:data.queryReleased===true });
      setMessage("Aperçu de la vue avec les filtres et tris Notion enregistrés.");
    } catch (error) { setOperationError(true); setMessage(error instanceof Error ? error.message : "Aperçu indisponible."); }
    finally { setBusy(""); }
  }

  async function verify() {
    if (!selected || busy) return;
    setOperationError(false);setBusy("permission");
    try {
      const data = await readEndpoint("capabilities", { ...binding, verify: "1",
        resourceKind: selected.kind, resourceId: selected.id });
      const expected = selected.kind === "page" ? "rest.pages.retrieve" :
        selected.kind === "database" ? "rest.databases.retrieve" : "rest.data_sources.retrieve";
      const ok = Array.isArray(data.capabilities) && data.capabilities.some(
        (cap: { id?: string; available?: boolean }) => cap?.id === expected && cap.available === true);
      setPermission(ok ? "Lecture de cette ressource confirmée auprès de Notion." :
        "Le droit de lecture n'a pas été confirmé.");
    } catch (error) { setOperationError(true);
      setPermission(error instanceof Error ? error.message : "Vérification impossible.");
    } finally { setBusy(""); }
  }

  async function disconnect() {
    if (busy || disconnected || !window.confirm("Déconnecter cette intégration Notion d'ATLAS ?")) return;
    setOperationError(false);setBusy("disconnect");
    try {
      const response = await fetch("/api/apps/notion/connect/disconnect", {
        method: "POST", credentials: "same-origin",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams(binding),
      });
      if (!response.ok) throw new Error(providerMessage(response.status));
      const data = await response.json() as { providerRevocation?: string };
      setDisconnected(true);navigateMobile("library");
      setSelected(null); setResources([]); setViews([]); setPreview(null);
      setMessage(data.providerRevocation === "confirmed"
        ? "Déconnecté d'ATLAS. Révocation confirmée par Notion."
        : "Accès ATLAS coupé. Révocation distante non confirmée : suivi nécessaire.");
    } catch (error) { setOperationError(true); setMessage(error instanceof Error ? error.message : "Déconnexion non confirmée."); }
    finally { setBusy(""); }
  }

  return <div className={"nt-console nt-phone-"+mobileScreen+(showAccess?" nt-show-access":"")} id="notion-explorer">
    <nav className="nt-work-sections" aria-label="Organisation Notion">
      {workSections.map(section=><button key={section.id} type="button"
        aria-pressed={workSection===section.id} disabled={Boolean(busy)||disconnected}
        onClick={()=>void openSection(section.id)}>
        <span aria-hidden="true">{section.icon}</span>{section.label}
      </button>)}
    </nav>
    <div className="nt-phone-viewtop">
      <div className="nt-phone-viewtitle">

        <strong aria-live="polite">{mobileScreen==="library"?sectionInfo.label:
          mobileScreen==="reader"?"Lecture":
          mobileScreen==="views"?"Vues enregistrées":"Accès & droits"}</strong>
      </div>
      {mobileScreen==="library" && <button type="button" className="nt-phone-back"
        aria-label="Actualiser les ressources" disabled={Boolean(busy)||disconnected}
        onClick={()=>void search()}>Actualiser</button>}
      {mobileScreen!=="library" && <button type="button"
        className="nt-phone-back" onClick={()=>navigateMobile("library")}>
        <span aria-hidden="true">‹</span> Explorer
      </button>}
    </div>
    <div className="nt-console-top">
      <span className="nt-toolbar-label">{sectionInfo.label}</span>
      <div className="nt-toolbar-actions">
        <button className="nt-button nt-button-quiet" type="button" onClick={() => void search()}
          disabled={Boolean(busy) || disconnected}>Actualiser les ressources</button>
        <button type="button" className="nt-button nt-button-quiet nt-access-toggle"
          aria-expanded={showAccess} aria-controls={"nt-inspector-"+connectionId}
          onClick={()=>setShowAccess(!showAccess)}>Accès</button>
      </div>
    </div>
    <p className={"nt-status"+(busy?" nt-status-loading":"")+
      (!busy && !operationError && !disconnected?" nt-sr-only":"")} role="status"
      aria-live="polite">{busy ? "Chargement…" : message}</p>
    <div className="nt-browser" aria-busy={Boolean(busy)}>
      <aside className="nt-library" id={"nt-library-"+connectionId} aria-label="Ressources Notion">
        <div className="nt-pane-heading"><span>Bibliothèque</span><span>{resources.length}</span></div>

        <form className="nt-search" onSubmit={(e: FormEvent) => { e.preventDefault(); void search(); }}>
          <label className="nt-sr-only" htmlFor={"nt-query-" + connectionId}>Recherche par titre Notion</label>
          <div className="nt-search-row"><input id={"nt-query-" + connectionId} type="search"
            maxLength={200} placeholder="Rechercher dans Notion…" value={query}
            onChange={e => { setQuery(e.target.value); setResourceCursor(null); }} disabled={disconnected} />
            <button type="submit" disabled={Boolean(busy) || disconnected} aria-label="Rechercher">⌕</button>
          </div>
        </form>
        {!sectionBindings[workSection] && <p className="nt-section-hint">{sectionInfo.hint}</p>}
        <div className="nt-resource-filters" role="group" aria-label="Filtrer les ressources affichées">
          {resourceFilters.map(filter=><button key={filter.id} type="button"
            className={"nt-filter-chip"+(resourceFilter===filter.id?" nt-filter-active":"")}
            aria-pressed={resourceFilter===filter.id}
            onClick={()=>setResourceFilter(filter.id)}>{filter.label}</button>)}
        </div>

        <div className="nt-resource-list">
          {!loaded && <p className="nt-placeholder">Lecture des ressources autorisées…</p>}
          {loaded && resources.length === 0 && (loadError ?
            <div className="nt-placeholder" role="alert">
              <strong>Impossible de charger la bibliothèque Notion.</strong>
              <p>Consultez le code ci-dessus, puis réessayez.</p>
            </div> :
            <p className="nt-placeholder">
              Aucune ressource renvoyée par Notion. Dans Notion, ouvrez une page,
              puis « ••• » → « Connexions » → ajoutez l’intégration ATLAS à cette page.
              Revenez ici et actualisez les ressources.
            </p>)}
          {loaded && resources.length>0 && visibleResources.length===0 &&
            <p className="nt-placeholder">Aucun élément de ce type parmi les résultats chargés.</p>}
          {visibleResources.map(item => <button type="button" key={item.id}
            className={"nt-resource" + (selected?.id === item.id ? " nt-selected" : "")}
            onClick={() => assignResource(item)} disabled={Boolean(busy) || disconnected}
            aria-pressed={selected?.id === item.id} aria-label={"Ouvrir "+resourceLabels[item.kind]+ " : "+item.title}>
            <span className="nt-item-icon" aria-hidden="true">{item.kind === "page" ? "▤" : "▦"}</span>
            <span><strong>{item.title}</strong><small>{item.kind === "page" ? "Page" :
              item.kind === "database" ? "Base" : "Source de données"}</small></span>
            <span className="nt-resource-chevron" aria-hidden="true">›</span>
          </button>)}
          {resourceCursor && <button type="button" className="nt-link-button"
            onClick={() => void search(true)} disabled={Boolean(busy)}>Afficher plus de ressources</button>}
        </div>
      </aside>
      <section className={"nt-stage"+(mobileScreen==="views" &&
          (!selected||selected.kind==="page")?" nt-stage-no-views":"")}
          id={"nt-stage-"+connectionId}
          aria-label="Lecteur Notion et aperçus des ressources">
        {mobileScreen==="views" && (!selected || selected.kind==="page") &&
          <div className="nt-phone-views-empty" role="status">
            <div className="nt-phone-empty-icon" aria-hidden="true">▦</div>
            <h3>Choisissez une base Notion</h3>
            <p>Les vues enregistrées proviennent des bases et sources autorisées.</p>
            <button type="button" className="nt-button nt-button-dark"
              onClick={()=>navigateMobile("library")}>Explorer la bibliothèque</button>
          </div>}
        {!selected ? <div className="nt-stage-empty">
          <div className="nt-stage-symbol" aria-hidden="true">N</div>
          <h3>{sectionInfo.label}</h3>
          <p>{sectionInfo.hint}</p>
        </div> : <>
          <div className="nt-stage-title">
            <div><span className="nt-kicker">{selected.kind === "page" ? "PAGE PARTAGÉE" : "RESSOURCE NOTION"}</span>
              <h3>{selected.title}</h3><p>
                <span className="nt-resource-type-tag">{resourceLabels[selected.kind]}</span>
                Dernière modification : {date(selected.editedAt)}
              </p></div>
            {selected.url && <a className="nt-button nt-button-dark" href={selected.url}
              target="_blank" rel="noopener noreferrer">Ouvrir dans Notion ↗</a>}
          </div>
          {selected.kind === "page" ? <div className="nt-preview">
            <div className="nt-document-tabs" role="group" aria-label="Choisir le mode de lecture">
              <button type="button" className={"nt-document-tab"+(documentMode==="document"?" nt-tab-active":"")}
                onClick={()=>setDocumentMode("document")} aria-pressed={documentMode==="document"}>
                Document
              </button>
              <button type="button" className={"nt-document-tab"+(documentMode==="markdown"?" nt-tab-active":"")}
                disabled={Boolean(busy) || disconnected}
                onClick={()=>void showMarkdown()} aria-pressed={documentMode==="markdown"}>
                Markdown
              </button>
            </div>
            {documentMode==="markdown" ? <section className="nt-markdown-panel"
              aria-label="Lecture Markdown filtrée">
              <div className="nt-kicker">MARKDOWN NOTION V1 · APERÇU FILTRÉ</div>
              <p className="nt-muted">Aperçu texte : liens des fichiers et éléments complexes masqués.
                Cette vue ne fournit pas d’export sans perte.</p>
              {!markdownPreview && <p className="nt-placeholder">
                {busy==="markdown"?"Lecture du Markdown depuis Notion…":
                  "Markdown indisponible. Réessayez ou consultez la page dans Notion."}</p>}
              {markdownPreview?.lines.map((line,index)=>
                <div key={index} className={"nt-md-line nt-md-"+line.kind}>{line.text || " "}</div>)}
              {markdownPreview && (markdownPreview.truncated || markdownPreview.unknownCount>0) &&
                <p className="nt-preview-caution" role="status">
                  Contenu partiel ou non accessible. Consultez l’original dans Notion.
                </p>}
            </section> : <>
              {documentPartial && <span className="nt-stat-limited">Extrait partiel</span>}
              {!blocks.length && !busy && <div className="nt-reader-empty">
                <strong>Aucun bloc visible.</strong>
                <p>Le contenu peut être vide, non partagé ou hors des limites de l’aperçu.</p>
              </div>}
              <div className="nt-document-preview">
                {blocks.map(block => <NotionDocumentBlock key={block.id}
                  block={block} binding={binding}/>)}
              </div>
              {documentCursor && <button type="button" className="nt-load-more"
                disabled={Boolean(busy) || disconnected}
                onClick={()=>void moreDocument()}>
                Afficher les blocs suivants <span aria-hidden="true">↓</span>
              </button>}
              {documentPartial && <p className="nt-preview-caution">
                Aperçu partiel : certains sous-blocs ne sont pas chargés.
                Ouvrez Notion pour consulter la suite.</p>}

            </>}
          </div> : <>
            {selected.kind==="database" && !sourceRefs.length && !busy &&
              <p className="nt-placeholder">Aucune source accessible.</p>}
            {selected.kind==="database" && sourceRefs.length>1 &&
              <div className="nt-source-tabs" role="group" aria-label="Sources de données de la base">
                {sourceRefs.map(source=><button type="button" key={source.id}
                  aria-pressed={activeSourceId===source.id} disabled={Boolean(busy)||disconnected}
                  onClick={()=>void selectSource(source.id)}>{source.name}</button>)}
              </div>}
            {activeSourceId && !currentView && <section className="nt-sources" aria-label="Colonnes et lignes de la source">
              <div className="nt-view-bar"><h4>Contenu</h4><span>{sourceRows.length} lignes</span></div>
              <p className="nt-table-scroll-hint nt-sr-only">Faites défiler horizontalement pour voir toutes les colonnes.</p>
              <div className="nt-source-table-scroll" role="region" tabIndex={0}
                aria-label="Lignes et propriétés Notion">
                <table className="nt-source-table"><thead><tr>
                  {sourceColumns.map(column=><th scope="col" key={column.key}>
                    {column.name}<small>{column.type}</small>
                  </th>)}</tr></thead><tbody>
                  {sourceRows.map(row=><tr key={row.id}>
                    {sourceColumns.map((column,index)=><td key={column.key}>
                      {column.type==="title" && row.url ?
                        <button type="button" className="nt-preview-open" disabled={Boolean(busy)||disconnected}
                          onClick={()=>void choose({id:row.id,kind:"page",title:row.title,url:row.url,editedAt:null})}>
                          {row.cells[index]?.value||row.title}</button>:
                        <span>{column.type==="status"||column.type==="select"?
                          <span className="nt-value-pill">{row.cells[index]?.value||"—"}</span>:
                        column.type==="checkbox"?
                          <span className="nt-value-check">{row.cells[index]?.value||"—"}</span>:
                          (row.cells[index]?.value||"—")}</span>}
                    </td>)}
                  </tr>)}</tbody></table>
              </div>
              {!sourceRows.length && <p className="nt-placeholder">
                Aucune ligne accessible pour cette source.</p>}
              {sourceCursor && <button type="button" className="nt-link-button"
                disabled={Boolean(busy)||disconnected}
                onClick={()=>void moreSourceRows()}>Afficher les lignes suivantes</button>}
              {sourceLimited && <p className="nt-muted">
                Aperçu volontairement limité : certaines colonnes ou lignes peuvent manquer.</p>}

            </section>}
            <div className="nt-view-content">
            <div className="nt-view-section-head">
              <div><h4>Vues</h4></div><span className="nt-view-count">{views.length} vue(s)</span>
            </div>
            <div className="nt-views">
              {currentView && <button type="button" className="nt-view-tile"
                onClick={()=>{
                  setCurrentView(null);setPreview(null);navigateMobile("reader");
                  setSectionBindings(previous=>previous[workSection]?.id===selected.id?
                    {...previous,[workSection]:{id:selected.id,kind:selected.kind}}:previous);
                }}
                disabled={Boolean(busy)}><span aria-hidden="true">▦</span><strong>Tout le contenu</strong></button>}
              {views.map(item => <button type="button" key={item.id}
                className={"nt-view-tile" + (currentView?.id === item.id ? " nt-active-view" : "")}
                onClick={() => void showView(item)} disabled={Boolean(busy)} aria-pressed={currentView?.id === item.id}>
                <span className="nt-view-glyph" aria-hidden="true">{item.type === "calendar" ? "▦" :
                  item.type === "board" ? "▥" : item.type === "gallery" ? "▧" : "▤"}</span>
                <strong>{item.name}</strong>
                <small>{types[item.type] ?? "Vue"}</small>
                {item.metadata && <span className="nt-view-badges">
                  {item.metadata.hasFilter && <small>Filtre actif</small>}
                  {item.metadata.sortCount>0 &&
                    <small>{item.metadata.sortCount} tri(s)</small>}
                  {item.metadata.hasGrouping && <small>Regroupement Notion</small>}
                  {item.metadata.quickFilterCount>0 &&
                    <small>{item.metadata.quickFilterCount} filtre(s) rapide(s)</small>}
                </span>}
              </button>)}
              {!views.length && !busy && <p className="nt-placeholder">Aucune vue accessible pour cette ressource.</p>}
            </div>
            {viewCursor && <button type="button" className="nt-link-button"
              onClick={() => void moreViews()} disabled={Boolean(busy)}>Voir les autres vues</button>}
            {currentView && <div className="nt-preview">
              <div className="nt-preview-top"><div><span className="nt-kicker">APERÇU DE VUE NATIVE</span>
                <h4>{currentView.name}</h4>
                <p>{types[currentView.type] ?? "Vue"} · filtres et tris appliqués par Notion</p>
              </div>{currentView.url && <a href={currentView.url} target="_blank"
                rel="noopener noreferrer" className="nt-button nt-button-dark">Voir la vraie vue ↗</a>}</div>
              {!preview ? <p className="nt-placeholder">{busy === "preview" ? "Lecture de l’aperçu…" : message}</p> :
                <><details className="nt-view-details"><summary>Détails de la vue</summary>{preview.metadata && <p className="nt-muted">
                  Aperçu issu de la source {preview.metadata.sourceId?
                    "Notion liée à cette vue":"Notion (dashboard)"}.
                  {preview.metadata.hasFilter ? " Filtres enregistrés actifs.":""}
                  {preview.metadata.sortCount>0 ?
                    " Tri(s) enregistré(s) : "+preview.metadata.sortCount+".":""}
                  Les critères restent chez Notion.</p>}
                {!preview.queryReleased && <p className="nt-muted">
                  Le cache temporaire de l’aperçu expirera automatiquement chez Notion.</p>}
                {preview.totalCount !== null && <p className="nt-muted">
                  {preview.totalCount} élément(s) annoncés par Notion.</p>}
                </details><ul className="nt-preview-items">{preview.results.map(item => <li key={item.id}>
                  <span aria-hidden="true">▤</span><button type="button" className="nt-preview-open"
                    disabled={Boolean(busy)||disconnected} onClick={()=>void choose(item)}>{item.title}</button>
                  {item.url && <a href={item.url} target="_blank" rel="noopener noreferrer"
                    aria-label={"Ouvrir " + item.title + " dans Notion"}>↗</a>}
                </li>)}</ul>
                {!preview.results.length && <p className="nt-placeholder">
                  Aucun élément dans cet aperçu, selon les filtres de la vue.</p>}
                {preview.hasMore && <p className="nt-muted">
                  Aperçu limité aux 12 premiers éléments. Ouvrez la vue dans Notion pour la suite.</p>}
                </>}
              <details className="nt-view-details"><summary>À propos de cet aperçu</summary>
                <small>ATLAS ne reproduit ni la mise en page complète, ni les interactions Notion.</small>
              </details>
            </div>}
            </div>
          </>}
        </>}
      </section>
      <aside className="nt-inspector" id={"nt-inspector-"+connectionId} aria-label="État et permissions">
        <div className="nt-pane-heading"><span>Contrôle d’accès</span><span>REST</span></div>
        <div className="nt-inspector-card"><span className="nt-kicker">CONNEXION PERSONNELLE</span>
          <strong>{connection.label}</strong><p>{disconnected ? "Déconnectée" :
            "Identifiants enregistrés · accès fournisseur à vérifier par ressource."}</p></div>
        <div className="nt-inspector-card"><strong>Ressource sélectionnée</strong>
          <p>{selected ? selected.title : "Aucune sélection"}</p>
          {selected && <button type="button" className="nt-button nt-button-quiet"
            onClick={() => void verify()} disabled={Boolean(busy)}>Vérifier mon accès</button>}
          {permission && <p role="status">{permission}</p>}
        </div>
        <p className="nt-muted">Raccourcis conservés dans cet onglet. Aucun contenu Notion enregistré.</p>
        <details className="nt-inspector-details"><summary>Capacités de la connexion</summary>
          {!disconnected && <NotionCapabilitiesClient workspaceId={workspaceId} connectionId={connectionId}/>}
        </details>
        <div className="nt-inspector-foot">
          <a className="nt-phone-manage-link" href="#notion-connections">
            Gérer les connexions du workspace ↗
          </a>
          <p>Les pages non partagées ne sont pas accessibles. Aucune écriture Notion, aucun agent ni synchronisation automatique.</p>
          <button type="button" className="nt-danger-link" onClick={() => void disconnect()}
            disabled={Boolean(busy) || disconnected}>Déconnecter Notion</button>
        </div>
      </aside>
    </div>
    <nav className="nt-phone-dock" aria-label="Navigation Notion mobile">
      <button type="button" className={mobileScreen==="library"?"is-active":""}
        aria-current={mobileScreen==="library"?"page":undefined}
        aria-controls={"nt-library-"+connectionId}
        onClick={()=>navigateMobile("library")}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"
          aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/>
          <path d="M3 10h18M9 10v10"/></svg><span>Explorer</span>
      </button>
      <button type="button" className={mobileScreen==="reader"?"is-active":""}
        aria-current={mobileScreen==="reader"?"page":undefined}
        aria-controls={"nt-stage-"+connectionId}
        onClick={()=>navigateMobile("reader")}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"
          aria-hidden="true"><path d="M7 3h8l4 4v14H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/>
          <path d="M14 3v5h5M9 12h6M9 16h6"/></svg><span>Lecture</span>
      </button>
      <button type="button" className={mobileScreen==="views"?"is-active":""}
        aria-current={mobileScreen==="views"?"page":undefined}
        aria-controls={"nt-stage-"+connectionId}
        onClick={()=>navigateMobile("views")}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"
          aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1"/>
          <rect x="14" y="3" width="7" height="7" rx="1"/>
          <rect x="3" y="14" width="7" height="7" rx="1"/>
          <rect x="14" y="14" width="7" height="7" rx="1"/></svg><span>Vues</span>
      </button>
      <button type="button" className={mobileScreen==="access"?"is-active":""}
        aria-current={mobileScreen==="access"?"page":undefined}
        aria-controls={"nt-inspector-"+connectionId}
        onClick={()=>navigateMobile("access")}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"
          aria-hidden="true"><path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11z"/>
          <path d="m9 12 2 2 4-4"/></svg><span>Réglages</span>
      </button>
    </nav>
  </div>;
}

export function NotionResourcesClient({ connections }: { connections: Connection[] }) {
  const [active, setActive] = useState(connections[0]?.id ?? "");
  const chosen = connections.find(connection => connection.id === active) ?? connections[0];
  if (!chosen) return null;
  return <section className="nt-hub" aria-label="Poste de pilotage Notion">
    <div className="nt-hub-switch"><div>
      <strong>{chosen.label}</strong></div>
      {connections.length > 1 && <label>Connexion
        <select value={chosen.id} onChange={event => setActive(event.target.value)}>
          {connections.map(item => <option value={item.id} key={item.id}>{item.label}</option>)}
        </select></label>}
    </div>
    <NotionExplorer key={chosen.id} connection={chosen}/>
  </section>;
}
