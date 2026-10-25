"use client";
import { useEffect, useState, type FormEvent } from "react";
import { NotionCapabilitiesClient } from "./notion-capabilities-client";

type Connection = { id: string; workspaceId: string; label: string };
type Resource = { id: string; kind: "page" | "database" | "data_source";
  title: string; editedAt: string | null; url: string | null };
type NativeView = { id: string; name: string; type: string;
  url: string | null; editedAt: string | null };
type Block = { id: string; type: string; text: string; hasChildren: boolean };
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
async function readEndpoint(path: "read" | "views" | "capabilities", values: Record<string,string>) {
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

function NotionExplorer({ connection }: { connection: Connection }) {
  const { workspaceId, id: connectionId } = connection;
  const binding = { workspaceId, connectionId };
  const [query, setQuery] = useState("");
  const [resources, setResources] = useState<Resource[]>([]);
  const [resourceCursor, setResourceCursor] = useState<string | null>(null);
  const [selected, setSelected] = useState<Resource | null>(null);
  const [views, setViews] = useState<NativeView[]>([]);
  const [viewCursor, setViewCursor] = useState<string | null>(null);
  const [currentView, setCurrentView] = useState<NativeView | null>(null);
  const [preview, setPreview] = useState<{ results: Resource[]; totalCount: number | null; hasMore: boolean } | null>(null);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [permission, setPermission] = useState("");
  const [message, setMessage] = useState("Choisissez une ressource pour afficher son aperçu.");
  const [busy, setBusy] = useState("");
  const [disconnected, setDisconnected] = useState(false);
  const [loaded, setLoaded] = useState(false);

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
        setSelected(null); setViews([]); setCurrentView(null); setPreview(null); setBlocks([]);
      }
      setMessage(entries.length ? "Résultats autorisés chargés depuis Notion."
        : "Aucun résultat pour ce titre parmi les ressources partagées.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Notion indisponible."); }
    finally { setBusy(""); }
  }

  async function choose(item: Resource) {
    if (busy || disconnected) return;
    setSelected(item); setViews([]); setViewCursor(null); setCurrentView(null);
    setPreview(null); setBlocks([]); setPermission("");
    setBusy("resource");
    try {
      if (item.kind === "page") {
        const data = await readEndpoint("read", {
          ...binding, kind: "blocks", resourceId: item.id,
        });
        if (!Array.isArray(data.results)) throw new Error("Aperçu indisponible.");
        setBlocks(data.results.filter((block): block is Block => Boolean(
          block && typeof block === "object" && typeof block.id === "string" &&
          typeof block.type === "string" && typeof block.text === "string")));
        setMessage("Aperçu des premiers blocs de cette page Notion.");
      } else {
        const data = await readEndpoint("views", {
          ...binding, mode: "list", sourceKind: item.kind, resourceId: item.id,
        });
        const entries = nativeViews(data.results);
        setViews(entries);
        setViewCursor(data.hasMore === true && typeof data.nextCursor === "string" ? data.nextCursor : null);
        setMessage(entries.length ? "Vues natives disponibles. Sélectionnez une vue."
          : "Cette ressource ne présente aucune vue accessible à la connexion.");
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Ressource indisponible.");
    } finally { setBusy(""); }
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
    if (busy || disconnected) return;
    setCurrentView(item); setPreview(null); setBusy("preview");
    try {
      const data = await readEndpoint("views", { ...binding, mode: "preview", viewId: item.id });
      setPreview({ results: resourceList(data.results),
        totalCount: typeof data.totalCount === "number" ? data.totalCount : null,
        hasMore: data.hasMore === true });
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
      <div><span className="nt-kicker">EXPLORATEUR REST · LECTURE SEULE</span>
        <h2>Vos ressources et vues Notion</h2>
        <p>Les vues, filtres et données restent chez Notion. ATLAS affiche seulement un aperçu à la demande.</p>
      </div>
      <button className="nt-button nt-button-quiet" type="button" onClick={() => void search()}
        disabled={Boolean(busy) || disconnected}>Actualiser les ressources</button>
    </div>
    <p className="nt-status" role="status" aria-live="polite">{busy ? "Chargement sécurisé depuis Notion…" : message}</p>
    <div className="nt-browser">
      <aside className="nt-library" aria-label="Ressources Notion">
        <div className="nt-pane-heading"><span>Bibliothèque</span><span>{resources.length}</span></div>
        <form className="nt-search" onSubmit={(e: FormEvent) => { e.preventDefault(); void search(); }}>
          <label htmlFor={"nt-query-" + connectionId}>Recherche par titre Notion</label>
          <div className="nt-search-row"><input id={"nt-query-" + connectionId} type="search"
            maxLength={200} placeholder="Rechercher une page…" value={query}
            onChange={e => { setQuery(e.target.value); setResourceCursor(null); }} disabled={disconnected} />
            <button type="submit" disabled={Boolean(busy) || disconnected} aria-label="Rechercher">⌕</button>
          </div>
        </form>
        <div className="nt-resource-list">
          {!loaded && <p className="nt-placeholder">Lecture des ressources autorisées…</p>}
          {loaded && resources.length === 0 && <p className="nt-placeholder">
            Aucune ressource visible. Dans Notion, partagez une page ou une base avec l’intégration ATLAS.
          </p>}
          {resources.map(item => <button type="button" key={item.id}
            className={"nt-resource" + (selected?.id === item.id ? " nt-selected" : "")}
            onClick={() => void choose(item)} disabled={Boolean(busy) || disconnected}
            aria-pressed={selected?.id === item.id}>
            <span className="nt-item-icon" aria-hidden="true">{item.kind === "page" ? "▤" : "▦"}</span>
            <span><strong>{item.title}</strong><small>{item.kind === "page" ? "Page" :
              item.kind === "database" ? "Base" : "Source de données"}</small></span>
            <span className="nt-resource-chevron" aria-hidden="true">›</span>
          </button>)}
          {resourceCursor && <button type="button" className="nt-link-button"
            onClick={() => void search(true)} disabled={Boolean(busy)}>Afficher plus de ressources</button>}
        </div>
      </aside>
      <section className="nt-stage" aria-label="Aperçu des vues">
        {!selected ? <div className="nt-stage-empty">
          <div className="nt-stage-symbol" aria-hidden="true">N</div>
          <span className="nt-kicker">VOS DONNÉES RESTENT DANS NOTION</span>
          <h3>Un cockpit, pas une copie.</h3>
          <p>Choisissez une page ou une base à gauche pour découvrir les vues existantes, les consulter et ouvrir leur présentation complète dans Notion.</p>
        </div> : <>
          <div className="nt-stage-title">
            <div><span className="nt-kicker">{selected.kind === "page" ? "PAGE PARTAGÉE" : "RESSOURCE NOTION"}</span>
              <h3>{selected.title}</h3><p>Dernière modification : {date(selected.editedAt)}</p></div>
            {selected.url && <a className="nt-button nt-button-dark" href={selected.url}
              target="_blank" rel="noopener noreferrer">Ouvrir dans Notion ↗</a>}
          </div>
          {selected.kind === "page" ? <div className="nt-preview">
            <h4>Aperçu de la page</h4>
            {!blocks.length && !busy && <p className="nt-placeholder">Aucun bloc textuel disponible dans cet aperçu.</p>}
            {blocks.map(block => <div className="nt-block" key={block.id}>
              <span className="nt-block-type">{block.type}</span>
              <p>{block.text || "Contenu non textuel"}</p>
              {block.hasChildren && <small>Contient des sous-blocs · ouvrir dans Notion pour tout voir</small>}
            </div>)}
            {blocks.length > 0 && <small>Premiers blocs uniquement. Pas d’édition ni de synchronisation.</small>}
          </div> : <>
            <div className="nt-view-bar"><h4>Vues enregistrées dans Notion</h4><span>{views.length} affichée(s)</span></div>
            <div className="nt-views">
              {views.map(item => <button type="button" key={item.id}
                className={"nt-view-tile" + (currentView?.id === item.id ? " nt-active-view" : "")}
                onClick={() => void showView(item)} disabled={Boolean(busy)} aria-pressed={currentView?.id === item.id}>
                <span className="nt-view-glyph" aria-hidden="true">{item.type === "calendar" ? "▦" :
                  item.type === "board" ? "▥" : item.type === "gallery" ? "▧" : "▤"}</span>
                <strong>{item.name}</strong><small>{types[item.type] ?? "Vue"}</small>
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
                <>{preview.totalCount !== null && <p className="nt-muted">
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
