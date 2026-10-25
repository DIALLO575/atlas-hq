"use client";
import { useEffect, useState, type FormEvent } from "react";
import { NotionCapabilitiesClient } from "./notion-capabilities-client";

type Connection = { id: string; workspaceId: string; label: string };
type ResourceFilter="all"|"page"|"database"|"data_source";
const resourceFilters:{id:ResourceFilter;label:string}[]=[
  {id:"all",label:"Tout"},{id:"page",label:"Pages"},
  {id:"database",label:"Bases"},{id:"data_source",label:"Sources"},
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
function providerMessage(status: number) {
  if (status === 403 || status === 404) return "Ressource non accessible avec les droits Notion actuels.";
  if (status === 409) return "Connexion à renouveler ou actualisation déjà en cours.";
  if (status === 429) return "Notion limite les requêtes. Réessayez plus tard.";
  return "Lecture indisponible. Vérifiez la connexion avant de réessayer.";
}
async function readEndpoint(path: "read" | "views" | "data" | "capabilities", values: Record<string,string>) {
  const response = await fetch("/api/apps/notion/" + path + "?" +
    new URLSearchParams(values), { credentials: "same-origin", cache: "no-store" });
  if (!response.ok) throw new Error(providerMessage(response.status));
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
  const [query, setQuery] = useState("");
  const [resourceFilter,setResourceFilter]=useState<ResourceFilter>("all");
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
  const [permission, setPermission] = useState("");
  const [message, setMessage] = useState("Choisissez une ressource pour afficher son aperçu.");
  const [busy, setBusy] = useState("");
  const [disconnected, setDisconnected] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const visibleResources=resourceFilter==="all"?resources:
    resources.filter(item=>item.kind===resourceFilter);
  const mediaCount=(items:Block[]):number=>items.reduce((n,block)=>
    n+(block.media?1:0)+mediaCount(block.children??[]),0);

  // One initial title search per selected connection; never poll or prefetch
  // every workspace in the browser.
  useEffect(() => {
    const controller = new AbortController();
    async function initial() {
      setBusy("search");
      try {
        const response = await fetch("/api/apps/notion/read?" +
          new URLSearchParams({ workspaceId, connectionId, kind: "search", query: "" }),
          { credentials: "same-origin", cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error(providerMessage(response.status));
        const data = await response.json() as { results?: unknown; hasMore?: boolean; nextCursor?: unknown };
        if (!controller.signal.aborted) {
          const entries = resourceList(data.results);
          setResources(entries);
          setResourceCursor(data.hasMore && typeof data.nextCursor === "string" ? data.nextCursor : null);
          setMessage(entries.length ? "Choisissez une page ou une base pour explorer ses vues."
            : "Aucune ressource partagée détectée. Partagez une page ou une base avec la connexion dans Notion.");
        }
      } catch (error) {
        if (!controller.signal.aborted) setMessage(error instanceof Error ? error.message : "Notion indisponible.");
      } finally {
        if (!controller.signal.aborted) { setLoaded(true); setBusy(""); }
      }
    }
    void initial();
    return () => controller.abort();
  }, [workspaceId, connectionId]);

  async function search(more = false) {
    if (busy || disconnected) return;
    setBusy("search");
    try {
      const data = await readEndpoint("read", { ...binding, kind: "search", query: query.slice(0, 200),
        ...(more && resourceCursor ? { cursor: resourceCursor } : {}) });
      const entries = resourceList(data.results);
      setResources(previous => more ? [...previous, ...entries] : entries);
      setResourceCursor(data.hasMore === true && typeof data.nextCursor === "string" ? data.nextCursor : null);
      if (!more) {
        setSelected(null); setViews([]); setCurrentView(null); setPreview(null); setSourceRefs([]); setSourceColumns([]); setSourceRows([]); setSourceCursor(null); setSourceLimited(false); setMarkdownPreview(null); setDocumentMode("document"); setBlocks([]); setDocumentPartial(false); setDocumentCursor(null);
      }
      setMessage(entries.length ? "Résultats autorisés chargés depuis Notion."
        : "Aucun résultat pour ce titre parmi les ressources partagées.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Notion indisponible."); }
    finally { setBusy(""); }
  }

  async function choose(item: Resource) {
    if (busy || disconnected) return;
    setSelected(item); setViews([]); setViewCursor(null); setCurrentView(null);
    setSourceRefs([]);setSourceColumns([]);setSourceRows([]);
    setSourceCursor(null);setSourceLimited(false);
    setPreview(null); setMarkdownPreview(null); setDocumentMode("document"); setBlocks([]); setDocumentPartial(false); setDocumentCursor(null); setPermission("");
    setBusy("resource");
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
        if (item.kind === "database") {
          const found=await readEndpoint("data",{
            ...binding,mode:"discover",resourceId:item.id,
          });
          if(!Array.isArray(found.results))throw new Error("Sources Notion invalides.");
          setSourceRefs(found.results.filter((source):source is SourceRef=>
            Boolean(source && UUID.test(source.id??"") && typeof source.name==="string")));
          setSourceLimited(found.truncated===true);
        } else {
          const rows=await readEndpoint("data",{
            ...binding,mode:"rows",resourceId:item.id,
          }) as SourceResult;
          if(!Array.isArray(rows.columns)||!Array.isArray(rows.results))
            throw new Error("Tableau Notion invalide.");
          setSourceColumns(rows.columns);
          setSourceRows(rows.results);
          setSourceCursor(rows.hasMore===true && typeof rows.nextCursor==="string"?
            rows.nextCursor:null);
          setSourceLimited(rows.truncated===true);
        }
        // View discovery is independent: a provider restriction on views
        // should not hide authorized schema/rows from the user.
        try {
          const data=await readEndpoint("views",{
            ...binding,mode:"list",sourceKind:item.kind,resourceId:item.id,
          });
          const entries=nativeViews(data.results);
          setViews(entries);
          setViewCursor(data.hasMore===true&&typeof data.nextCursor==="string"?
            data.nextCursor:null);
        }catch{
          setViews([]);setViewCursor(null);
        }
        setMessage(item.kind==="database"?
          "Sources et vues de cette base chargées, selon les droits Notion.":
          "Colonnes, lignes et vues accessibles chargées en lecture seule.");
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Ressource indisponible.");
    } finally { setBusy(""); }
  }



  async function showMarkdown() {
    if(busy || disconnected || selected?.kind!=="page")return;
    setDocumentMode("markdown");
    if(markdownPreview)return;
    setBusy("markdown");
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
    }catch(error){
      setMarkdownPreview(null);
      setMessage(error instanceof Error?error.message:"Markdown indisponible.");
    }finally{setBusy("");}
  }

  async function moreDocument() {
    if(busy || disconnected || selected?.kind!=="page" || !documentCursor)return;
    setBusy("document");
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
    }catch(error){
      setMessage(error instanceof Error?error.message:"Suite du document indisponible.");
    }finally{setBusy("");}
  }


  async function moreSourceRows() {
    if(busy || disconnected || selected?.kind!=="data_source" || !sourceCursor)return;
    setBusy("rows");
    try{
      const current=sourceCursor;
      const data=await readEndpoint("data",{
        ...binding,mode:"rows",resourceId:selected.id,cursor:current,
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
    }catch(error){
      setMessage(error instanceof Error?error.message:"Lignes Notion indisponibles.");
    }finally{setBusy("");}
  }

  async function moreViews() {
    if (busy || !selected || !viewCursor ||
      !["database", "data_source"].includes(selected.kind)) return;
    setBusy("views");
    try {
      const data = await readEndpoint("views", { ...binding, mode: "list",
        sourceKind: selected.kind, resourceId: selected.id, cursor: viewCursor });
      setViews(old => [...old, ...nativeViews(data.results)]);
      setViewCursor(data.hasMore === true && typeof data.nextCursor === "string" ? data.nextCursor : null);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Vues indisponibles."); }
    finally { setBusy(""); }
  }

  async function showView(item: NativeView) {
    if (busy || disconnected || !selected || selected.kind==="page") return;
    setCurrentView(item); setPreview(null); setBusy("preview");
    try {
      const data = await readEndpoint("views", { ...binding, mode: "preview", viewId: item.id,
        sourceKind:selected.kind,resourceId:selected.id });
      setPreview({ results: resourceList(data.results),
        totalCount: typeof data.totalCount === "number" ? data.totalCount : null,
        hasMore: data.hasMore === true,
        metadata:data.metadata && typeof data.metadata==="object"?
          data.metadata as ViewMetadata:null,
        queryReleased:data.queryReleased===true });
      setMessage("Aperçu de la vue avec les filtres et tris Notion enregistrés.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Aperçu indisponible."); }
    finally { setBusy(""); }
  }

  async function verify() {
    if (!selected || busy) return;
    setBusy("permission");
    try {
      const data = await readEndpoint("capabilities", { ...binding, verify: "1",
        resourceKind: selected.kind, resourceId: selected.id });
      const expected = selected.kind === "page" ? "rest.pages.retrieve" :
        selected.kind === "database" ? "rest.databases.retrieve" : "rest.data_sources.retrieve";
      const ok = Array.isArray(data.capabilities) && data.capabilities.some(
        (cap: { id?: string; available?: boolean }) => cap?.id === expected && cap.available === true);
      setPermission(ok ? "Lecture de cette ressource confirmée auprès de Notion." :
        "Le droit de lecture n'a pas été confirmé.");
    } catch (error) {
      setPermission(error instanceof Error ? error.message : "Vérification impossible.");
    } finally { setBusy(""); }
  }

  async function disconnect() {
    if (busy || disconnected || !window.confirm("Déconnecter cette intégration Notion d'ATLAS ?")) return;
    setBusy("disconnect");
    try {
      const response = await fetch("/api/apps/notion/connect/disconnect", {
        method: "POST", credentials: "same-origin",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams(binding),
      });
      if (!response.ok) throw new Error(providerMessage(response.status));
      const data = await response.json() as { providerRevocation?: string };
      setDisconnected(true); setSelected(null); setResources([]); setViews([]); setPreview(null);
      setMessage(data.providerRevocation === "confirmed"
        ? "Déconnecté d'ATLAS. Révocation confirmée par Notion."
        : "Accès ATLAS coupé. Révocation distante non confirmée : suivi nécessaire.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Déconnexion non confirmée."); }
    finally { setBusy(""); }
  }

  return <div className="nt-console">
    <div className="nt-console-top">
      <div><span className="nt-kicker">EXPLORATEUR NOTION · ESPACE PERSONNEL</span>
        <h2>Vos documents et vos bases, au même endroit.</h2>
        <p>Ouvrez une ressource, explorez son contenu et retrouvez ses vues officielles.
          Rien n’est synchronisé sans votre action.</p>
        <div className="nt-console-modes" aria-label="Contenu accessible en lecture seule">
          <span>Pages et médias</span><span>Sources et colonnes</span><span>Vues Notion</span>
        </div>
      </div>
      <button className="nt-button nt-button-quiet" type="button" onClick={() => void search()}
        disabled={Boolean(busy) || disconnected}>Actualiser les ressources</button>
    </div>
    <p className={"nt-status"+(busy?" nt-status-loading":"")} role="status"
      aria-live="polite">{busy ? "Chargement sécurisé depuis Notion…" : message}</p>
    <div className="nt-browser" aria-busy={Boolean(busy)}>
      <aside className="nt-library" aria-label="Ressources Notion">
        <div className="nt-pane-heading"><span>Bibliothèque</span><span>{resources.length}</span></div>
        <p className="nt-library-hint">Uniquement les ressources visibles par cette connexion.</p>
        <form className="nt-search" onSubmit={(e: FormEvent) => { e.preventDefault(); void search(); }}>
          <label htmlFor={"nt-query-" + connectionId}>Recherche par titre Notion</label>
          <div className="nt-search-row"><input id={"nt-query-" + connectionId} type="search"
            maxLength={200} placeholder="Rechercher une page…" value={query}
            onChange={e => { setQuery(e.target.value); setResourceCursor(null); }} disabled={disconnected} />
            <button type="submit" disabled={Boolean(busy) || disconnected} aria-label="Rechercher">⌕</button>
          </div>
        </form>
        <div className="nt-resource-filters" role="group" aria-label="Filtrer les ressources affichées">
          {resourceFilters.map(filter=><button key={filter.id} type="button"
            className={"nt-filter-chip"+(resourceFilter===filter.id?" nt-filter-active":"")}
            aria-pressed={resourceFilter===filter.id}
            onClick={()=>setResourceFilter(filter.id)}>{filter.label}</button>)}
        </div>
        <p className="nt-results-note">{visibleResources.length} sur {resources.length} ressource(s) chargée(s)</p>
        <div className="nt-resource-list">
          {!loaded && <p className="nt-placeholder">Lecture des ressources autorisées…</p>}
          {loaded && resources.length === 0 && <p className="nt-placeholder">
            Aucune ressource visible. Dans Notion, partagez une page ou une base avec l’intégration ATLAS.
          </p>}
          {loaded && resources.length>0 && visibleResources.length===0 &&
            <p className="nt-placeholder">Aucun élément de ce type parmi les résultats chargés.</p>}
          {visibleResources.map(item => <button type="button" key={item.id}
            className={"nt-resource" + (selected?.id === item.id ? " nt-selected" : "")}
            onClick={() => void choose(item)} disabled={Boolean(busy) || disconnected}
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
      <section className="nt-stage" aria-label="Lecteur Notion et aperçus des ressources">
        {!selected ? <div className="nt-stage-empty">
          <div className="nt-stage-symbol" aria-hidden="true">N</div>
          <span className="nt-kicker">VOS DONNÉES RESTENT DANS NOTION</span>
          <h3>Vos contenus commencent ici.</h3>
          <p>Sélectionnez une page pour lire son texte, ses images et ses documents,
            ou une base pour explorer ses colonnes et ses vues enregistrées.</p>
          <div className="nt-stage-feature-list">
            <span>▤ Documents et fichiers</span><span>▦ Tableaux et propriétés</span>
            <span>▥ Vues Notion</span>
          </div>
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
            <div className="nt-page-reader-head">
              <div><span className="nt-kicker">LECTEUR DE PAGE</span>
                <h4>Document et pièces jointes</h4>
                <p>Un aperçu à la demande, sans duplication des fichiers.</p>
              </div><span className="nt-readonly-token">Lecture seule</span>
            </div>
            <div className="nt-document-tabs" role="group" aria-label="Choisir le mode de lecture">
              <button type="button" className={"nt-document-tab"+(documentMode==="document"?" nt-tab-active":"")}
                onClick={()=>setDocumentMode("document")} aria-pressed={documentMode==="document"}>
                Document enrichi
              </button>
              <button type="button" className={"nt-document-tab"+(documentMode==="markdown"?" nt-tab-active":"")}
                disabled={Boolean(busy) || disconnected}
                onClick={()=>void showMarkdown()} aria-pressed={documentMode==="markdown"}>
                Markdown filtré
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
              <div className="nt-document-stats" aria-label="Éléments chargés dans la page">
                <span><strong>{blocks.length}</strong> blocs affichés</span>
                <span><strong>{mediaCount(blocks)}</strong> médias détectés</span>
                {documentPartial && <span className="nt-stat-limited">Extrait partiel</span>}
              </div>
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
              {blocks.length>0 && <small className="nt-reader-note">
                Images et documents chargés à la demande. Aucun stockage permanent dans ATLAS.</small>}
            </>}
          </div> : <>
            {selected.kind==="database" && <section className="nt-sources"
              aria-label="Sources de données de la base">
              <div className="nt-view-bar"><h4>Sources de données</h4>
                <span>{sourceRefs.length} source(s)</span></div>
              <p className="nt-muted">Chaque source possède son schéma de colonnes et ses lignes.
                Choisis une source pour consulter ses données autorisées.</p>
              <div className="nt-sources-list">{sourceRefs.map(source=>
                <button type="button" className="nt-source-item" key={source.id}
                  disabled={Boolean(busy)||disconnected}
                  onClick={()=>void choose({id:source.id,kind:"data_source",
                    title:source.name,editedAt:null,url:selected.url})}>
                  <span aria-hidden="true">▦</span>{source.name}<span aria-hidden="true">›</span>
                </button>)}</div>
              {!sourceRefs.length && <p className="nt-placeholder">
                Aucune source accessible avec cette connexion Notion.</p>}
              {sourceLimited && <small className="nt-muted">
                Liste volontairement limitée. Ouvre la base dans Notion pour la suite.</small>}
            </section>}
            {selected.kind==="data_source" && <section className="nt-sources"
              aria-label="Colonnes et lignes de la source">
              <div className="nt-view-bar"><h4>Colonnes et lignes</h4>
                <span>{sourceRows.length} ligne(s) affichée(s)</span></div>
              <p className="nt-muted">Aperçu brut de la source, sans filtres de vue.
                Pour voir les filtres et tris enregistrés, sélectionne une vue ci-dessous.</p>
              <p className="nt-table-scroll-hint">Faites défiler horizontalement pour voir toutes les colonnes.</p>
              <div className="nt-source-table-scroll" role="region" tabIndex={0}
                aria-label="Lignes et propriétés Notion">
                <table className="nt-source-table"><thead><tr>
                  {sourceColumns.map(column=><th scope="col" key={column.key}>
                    {column.name}<small>{column.type}</small>
                  </th>)}</tr></thead><tbody>
                  {sourceRows.map(row=><tr key={row.id}>
                    {sourceColumns.map((column,index)=><td key={column.key}>
                      {column.type==="title" && row.url ?
                        <a href={row.url} target="_blank" rel="noopener noreferrer">
                          {row.cells[index]?.value||row.title} ↗</a>:
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
              <small>Les formules affichent leur résultat, pas leur expression.
                Les fichiers et données personnelles ne sont pas transférés.</small>
            </section>}
            <div className="nt-view-section-head">
              <div><span className="nt-kicker">ORGANISATION PAR NOTION</span>
                <h4>Vues enregistrées</h4>
                <p>Filtres, tris et regroupements restent appliqués par Notion.</p>
              </div><span className="nt-view-count">{views.length} vue(s)</span>
            </div>
            <div className="nt-views">
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
                <>{preview.metadata && <p className="nt-muted">
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
                <ul className="nt-preview-items">{preview.results.map(item => <li key={item.id}>
                  <span aria-hidden="true">▤</span><strong>{item.title}</strong>
                  {item.url && <a href={item.url} target="_blank" rel="noopener noreferrer"
                    aria-label={"Ouvrir " + item.title + " dans Notion"}>↗</a>}
                </li>)}</ul>
                {!preview.results.length && <p className="nt-placeholder">
                  Aucun élément dans cet aperçu, selon les filtres de la vue.</p>}
                {preview.hasMore && <p className="nt-muted">
                  Aperçu limité aux 12 premiers éléments. Ouvrez la vue dans Notion pour la suite.</p>}
                </>}
              <small>ATLAS ne reproduit ni la mise en page complète, ni les interactions Notion.</small>
            </div>}
          </>}
        </>}
      </section>
      <aside className="nt-inspector" aria-label="État et permissions">
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
        <details className="nt-inspector-details"><summary>Capacités de la connexion</summary>
          {!disconnected && <NotionCapabilitiesClient workspaceId={workspaceId} connectionId={connectionId}/>}
        </details>
        <div className="nt-inspector-foot">
          <p>Les pages non partagées ne sont pas accessibles. Aucune écriture Notion, aucun agent ni synchronisation automatique.</p>
          <button type="button" className="nt-danger-link" onClick={() => void disconnect()}
            disabled={Boolean(busy) || disconnected}>Déconnecter Notion</button>
        </div>
      </aside>
    </div>
  </div>;
}

export function NotionResourcesClient({ connections }: { connections: Connection[] }) {
  const [active, setActive] = useState(connections[0]?.id ?? "");
  const chosen = connections.find(connection => connection.id === active) ?? connections[0];
  if (!chosen) return null;
  return <section className="nt-hub" aria-label="Poste de pilotage Notion">
    <div className="nt-hub-switch"><div><span className="nt-kicker">ESPACE CONNECTÉ</span>
      <strong>{chosen.label}</strong></div>
      {connections.length > 1 && <label>Connexion
        <select value={chosen.id} onChange={event => setActive(event.target.value)}>
          {connections.map(item => <option value={item.id} key={item.id}>{item.label}</option>)}
        </select></label>}
    </div>
    <NotionExplorer key={chosen.id} connection={chosen}/>
  </section>;
}
