"use client";

import { useCallback, useEffect, useState } from "react";
import { BrandLogo } from "@/components/brand-logo";

type Workspace = { id: string; name: string; role: "owner" | "admin" | "member" };
type Resource = "teams" | "projects" | "issues";
type Item = Record<string, unknown>;
type Page = { items: Item[]; pageInfo: { hasNextPage: boolean; endCursor: string | null }; incomplete: boolean };
type Status = { configured: boolean; callbackEnabled: boolean; connected: boolean };
const feedbackMessages: Record<string, string> = {
  "callback-disabled": "Le retour OAuth Linear est désactivé. La connexion ne peut pas être finalisée pour le moment.",
  connected: "Linear a confirmé la connexion.",
  "invalid-state": "La tentative de connexion a expiré. Relancez-la depuis cet écran.",
  forbidden: "Le workspace ou le compte n’est plus autorisé à connecter Linear.",
  "oauth-denied": "L’autorisation Linear a été annulée ou refusée.",
  unavailable: "Linear n’a pas pu terminer la connexion. Aucun état connecté n’est présumé.",
};

async function loadStatus(workspaceId: string): Promise<Status> {
  const response = await fetch(`/api/apps/linear/connection?workspaceId=${encodeURIComponent(workspaceId)}`, { cache: "no-store" });
  if (!response.ok) throw new Error("Impossible de vérifier l’état Linear pour ce compte et ce workspace.");
  return response.json() as Promise<Status>;
}

function errorMessage(status: number, body: { error?: string }) {
  const known: Record<string, string> = {
    "linear-not-configured": "Le connecteur Linear n’est pas configuré côté serveur.",
    "linear-not-connected": "Aucune connexion Linear personnelle n’est enregistrée pour ce workspace.",
    "linear-reauth-required": "La connexion Linear doit être renouvelée.",
    "linear-forbidden": "Linear ne permet pas de lire cette ressource.",
    "linear-rate-limited": "Linear limite temporairement les lectures. Réessayez plus tard.",
    "linear-invalid-response": "La réponse de Linear n’a pas pu être vérifiée.",
    "linear-refresh-pending": "Le renouvellement de la connexion est en cours. Réessayez dans quelques secondes.",
    "linear-refresh-unavailable": "Le renouvellement a échoué. La connexion n’est pas présentée comme active.",
  };
  return known[body.error ?? ""] ?? `Lecture Linear indisponible (HTTP ${status}).`;
}

export function LinearControlCenter({ workspaces, initialWorkspaceId, configured, feedback: feedbackCode, workspaceLoadFailed }: {
  workspaces: Workspace[]; initialWorkspaceId: string; configured: boolean; feedback: string; workspaceLoadFailed: boolean;
}) {
  const [workspaceId, setWorkspaceId] = useState(initialWorkspaceId);
  const workspace = workspaces.find((item) => item.id === workspaceId);
  const [status, setStatus] = useState<Status | null>(null);
  const [statusLoading, setStatusLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(feedbackMessages[feedbackCode] ?? null);
  const [error, setError] = useState<string | null>(null);
  const [pages, setPages] = useState<Partial<Record<Resource, Page>>>({});
  const [loadingResource, setLoadingResource] = useState<Resource | null>(null);

  const refreshStatus = useCallback(async () => {
    if (!workspaceId) { setStatus(null); return; }
    setStatusLoading(true); setError(null);
    try { setStatus(await loadStatus(workspaceId)); }
    catch (cause) { setStatus(null); setError(cause instanceof Error ? cause.message : "État Linear indisponible."); }
    finally { setStatusLoading(false); }
  }, [workspaceId]);

  useEffect(() => { void refreshStatus(); }, [refreshStatus]);
  useEffect(() => { setStatus(null); setPages({}); setNotice(null); }, [workspaceId]);

  async function readResource(resource: Resource, after?: string | null) {
    if (!workspaceId) return;
    setLoadingResource(resource); setError(null);
    try {
      const query = new URLSearchParams({ workspaceId, resource });
      if (after) query.set("after", after);
      const response = await fetch(`/api/apps/linear/read?${query}`, { cache: "no-store" });
      const body = await response.json() as Page & { error?: string };
      if (!response.ok) throw new Error(errorMessage(response.status, body));
      setPages((current) => {
        const old = current[resource];
        return { ...current, [resource]: { ...body, items: after && old ? [...old.items, ...body.items] : body.items } };
      });
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Lecture Linear indisponible."); }
    finally { setLoadingResource(null); }
  }

  async function disconnect() {
    if (!workspaceId) return;
    setBusy(true); setError(null); setNotice(null);
    try {
      const response = await fetch("/api/apps/linear/connect/disconnect", {
        method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ workspaceId }),
      });
      const result = await response.json() as { error?: string; result?: string; providerRevocation?: string };
      if (!response.ok || result.error) throw new Error("La déconnexion Linear n’a pas abouti.");
      setNotice(result.providerRevocation === "confirmed"
        ? "Connexion désactivée et révocation Linear confirmée."
        : "Connexion désactivée dans ATLAS. Linear n’a pas confirmé la révocation distante.");
      setPages({});
      await refreshStatus();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Déconnexion Linear indisponible."); }
    finally { setBusy(false); }
  }

  return <section className="linear-control-center" aria-labelledby="linear-page-heading">
    <header className="atlas-gh-hero">
      <div className="atlas-gh-identity">
        <span className="atlas-gh-mark"><BrandLogo slug="linear" size={45}/></span>
        <div><p className="atlas-overline">MES APPLICATIONS</p><h1 id="linear-page-heading">Linear</h1>
          <p>Vos équipes, projets et tickets accessibles depuis votre connexion personnelle.</p></div>
      </div>
      {workspaces.length > 1 && <label className="atlas-gh-workspace-pick">Workspace ATLAS
        <select value={workspaceId} onChange={(event) => setWorkspaceId(event.target.value)}>
          {workspaces.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
      </label>}
    </header>

    {workspaceLoadFailed && <p className="atlas-gh-notice" role="alert">Impossible de charger vos workspaces depuis la session ATLAS.</p>}
    {notice && <p className="atlas-gh-notice" role="status">{notice}</p>}
    {error && <p className="atlas-gh-notice" role="alert">{error}</p>}
    {!workspace ? <section className="linear-panel"><h2>Aucun workspace disponible</h2><p>Rejoignez un workspace ATLAS avant de consulter Linear.</p></section> : <>
      <section className="atlas-gh-connection-strip" aria-label="État de la connexion Linear">
        <div className="atlas-gh-connection-label"><i className={`atlas-gh-state-dot${status?.connected ? " is-ready" : ""}`}/>
          <strong>{workspace.name}</strong><span>{statusLoading ? "Vérification…" : status?.connected ? "Connexion personnelle active" : status?.configured ? "Non connecté" : "Configuration serveur indisponible"}</span>
        </div>
        <div className="atlas-gh-install-controls">
          <button type="button" className="atlas-gh-refresh" onClick={() => void refreshStatus()} disabled={statusLoading || busy}>Actualiser</button>
          {status?.connected && (workspace.role === "owner" || workspace.role === "admin") && <button type="button" className="atlas-gh-minor-action" onClick={() => void disconnect()} disabled={busy}>{busy ? "Déconnexion…" : "Déconnecter"}</button>}
        </div>
      </section>
      {statusLoading ? <p className="atlas-gh-notice" role="status">Vérification de la connexion personnelle…</p> :
        !configured || !status?.configured ? <p className="atlas-gh-notice" role="status">Le connecteur Linear n’est pas configuré côté serveur.</p> :
        !status?.callbackEnabled && !status?.connected ? <p className="atlas-gh-notice" role="status">Le retour OAuth est désactivé par défaut. Un administrateur ne peut pas terminer une nouvelle connexion pour le moment.</p> :
        !status?.connected && (workspace.role === "owner" || workspace.role === "admin") && <form action="/api/apps/linear/connect/start" method="post" className="linear-connect-form">
          <input type="hidden" name="workspaceId" value={workspace.id}/>
          <button className="app-action" type="submit">Connecter mon compte Linear</button>
          <p>La connexion est individuelle à votre compte ATLAS et à ce workspace. Aucun jeton n’est envoyé au navigateur.</p>
        </form>}
      {!status?.connected && (workspace.role !== "owner" && workspace.role !== "admin") && <p className="atlas-gh-notice">Un owner ou admin doit autoriser la connexion de son compte Linear.</p>}
      {status?.connected && <div className="linear-resources">
        {(["teams", "projects", "issues"] as Resource[]).map((resource) => {
          const page = pages[resource];
          const labels = { teams: ["Équipes", "Lire les équipes Linear"], projects: ["Projets", "Lire les projets Linear"], issues: ["Tickets", "Lire les tickets Linear"] };
          return <section className="linear-panel" key={resource} aria-labelledby={`linear-${resource}-heading`}>
            <header><div><h2 id={`linear-${resource}-heading`}>{labels[resource][0]}</h2><p>Jusqu’à 25 éléments par page.</p></div>
              {!page && <button type="button" className="atlas-gh-refresh" disabled={loadingResource !== null} onClick={() => void readResource(resource)}>{loadingResource === resource ? "Chargement…" : labels[resource][1]}</button>}
            </header>
            {page && (page.items.length === 0 ? <p>Aucun élément retourné par Linear.</p> : <ul className="linear-list">
              {page.items.map((item, index) => <li key={String(item.id ?? index)}>
                {resource === "teams" && <><strong>{String(item.key)} · {String(item.name)}</strong></>}
                {resource === "projects" && <><strong>{String(item.name)}</strong>{item.description && <span>{String(item.description)}</span>}</>}
                {resource === "issues" && <><strong>{String(item.identifier)} · {String(item.title)}</strong><span>{[item.team && (item.team as Item).name, item.project && (item.project as Item).name, item.state && (item.state as Item).name].filter(Boolean).join(" · ")}</span></>}
              </li>)}
            </ul>)}
            {page?.incomplete && <p className="linear-incomplete">Liste incomplète : d’autres résultats existent.</p>}
            {page?.pageInfo.hasNextPage && <button type="button" className="atlas-gh-minor-action" disabled={loadingResource !== null} onClick={() => void readResource(resource, page.pageInfo.endCursor)}>{loadingResource === resource ? "Chargement…" : "Charger la page suivante"}</button>}
          </section>;
        })}
      </div>}
    </>}
  </section>;
}
