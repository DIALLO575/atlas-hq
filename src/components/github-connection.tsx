"use client";

import { useEffect, useState } from "react";

type Installation = {
  installationId: number;
  status: string;
  repositorySelection: string | null;
  ownershipVerifiedAt: string | null;
  repositoriesVerifiedAt: string | null;
};
type Repository = { id: number; fullName: string; htmlUrl: string; private: boolean };
type Pull = { number: number; title: string; htmlUrl: string; headSha: string | null; draft: boolean };
type PullDetail = {
  title: string; body: string | null; resource: { headSha: string };
  files: { path: string; status: string; additions: number; deletions: number }[];
  filesTruncated: boolean;
};

async function load<T>(query: URLSearchParams): Promise<T> {
  const response = await fetch(`/api/apps/github?${query.toString()}`, { cache: "no-store" });
  if (!response.ok) throw new Error("Les ressources GitHub ne sont pas accessibles actuellement.");
  return response.json() as Promise<T>;
}

export function GitHubConnection({ workspaceId, canInstall, isConfigured }: {
  workspaceId: string; canInstall: boolean; isConfigured: boolean;
}) {
  const [installations, setInstallations] = useState<Installation[]>([]);
  const [selectedInstallation, setSelectedInstallation] = useState<number | null>(null);
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [selectedRepository, setSelectedRepository] = useState<number | null>(null);
  const [pulls, setPulls] = useState<Pull[]>([]);
  const [detail, setDetail] = useState<PullDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    if (!workspaceId) return;
    const query = new URLSearchParams({ view: "connections", workspaceId });
    load<{ installations: Installation[] }>(query)
      .then((result) => { if (active) setInstallations(result.installations); })
      .catch(() => { if (active) setError("Impossible de vérifier les connexions GitHub."); });
    return () => { active = false; };
  }, [workspaceId]);

  async function explore(installationId: number) {
    setLoading(true); setError(null); setRepositories([]); setPulls([]); setDetail(null);
    setSelectedInstallation(installationId); setSelectedRepository(null);
    try {
      const response = await load<{ repositories: Repository[]; truncated: boolean }>(
        new URLSearchParams({ workspaceId, view: "repositories", installationId: String(installationId) }),
      );
      setRepositories(response.repositories);
      if (response.truncated) setError("Liste des dépôts incomplète : la limite du connecteur est atteinte.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Connexion indisponible."); }
    finally { setLoading(false); }
  }

  async function openRepository(repositoryId: number) {
    if (!selectedInstallation) return;
    setLoading(true); setError(null); setDetail(null); setPulls([]); setSelectedRepository(repositoryId);
    try {
      const response = await load<{ pullRequests: Pull[]; truncated: boolean }>(
        new URLSearchParams({ workspaceId, view: "pulls",
          installationId: String(selectedInstallation), repositoryId: String(repositoryId) }),
      );
      setPulls(response.pullRequests);
      if (response.truncated) setError("Liste des PR incomplète : choisissez un dépôt plus ciblé.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Lecture des PR indisponible."); }
    finally { setLoading(false); }
  }

  async function openPull(number: number) {
    if (!selectedInstallation || !selectedRepository) return;
    setLoading(true); setError(null); setDetail(null);
    try {
      setDetail(await load<PullDetail>(new URLSearchParams({
        workspaceId, view: "pull", installationId: String(selectedInstallation),
        repositoryId: String(selectedRepository), pullNumber: String(number),
      })));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Lecture de la PR indisponible."); }
    finally { setLoading(false); }
  }

  return <section aria-label="Connexion GitHub" className="connector-card">
    <header className="connector-card-header">
      <span className="space-mark github">GH</span>
      <div className="provider-heading"><h2>GitHub</h2>
        <p>Connectez des dépôts autorisés et consultez de vraies Pull Requests dans ATLAS HQ.</p>
      </div>
    </header>
    {canInstall && isConfigured ? <form action="/api/apps/github/connect/start" method="post">
      <input type="hidden" name="workspaceId" value={workspaceId}/>
      <button type="submit" className="app-action">Connecter GitHub</button>
      <p className="connector-inline-note">Sur GitHub, choisissez votre compte personnel, puis « All repositories » ou « Only select repositories ». ATLAS vérifie l'installation et lit uniquement les Pull Requests.</p>
    </form> : <p className="connector-inline-note">{!isConfigured
      ? "Connexion indisponible : la GitHub App ATLAS HQ n’est pas encore configurée."
      : "Un administrateur du Workspace doit autoriser la connexion GitHub."}</p>}
    {installations.length === 0 ? <p className="section-footnote">Aucune installation GitHub vérifiée pour ce Workspace.</p> :
      <ul>{installations.map((item) => <li key={item.installationId}>
        Installation #{item.installationId} — {item.status === "repositories-ready" ? "Autorisation enregistrée" : "En attente de vérification"}
        {item.status === "repositories-ready" && <button type="button" onClick={() => explore(item.installationId)} disabled={loading}>Voir les dépôts</button>}
      </li>)}</ul>}
    {loading && <p role="status">Chargement des ressources réelles…</p>}
    {error && <p role="alert">{error}</p>}
    {repositories.length > 0 && <section aria-label="Dépôts GitHub">
      <h3>Dépôts autorisés</h3>
      <ul>{repositories.map((repository) => <li key={repository.id}>
        <button type="button" onClick={() => openRepository(repository.id)} disabled={loading}>
          {repository.fullName}{repository.private ? " · Privé" : ""}
        </button>
      </li>)}</ul>
    </section>}
    {selectedRepository && !loading && <section aria-label="Pull Requests GitHub">
      <h3>Pull Requests ouvertes</h3>
      {pulls.length === 0 ? <p>Aucune PR ouverte ou accessible.</p> :
        <ul>{pulls.map((pull) => <li key={pull.number}>
          <button type="button" onClick={() => openPull(pull.number)} disabled={loading}>
            #{pull.number} — {pull.title}
          </button>
        </li>)}</ul>}
    </section>}
    {detail && <section aria-label="Détails de Pull Request">
      <h3>{detail.title}</h3>
      <p>Révision : <code>{detail.resource.headSha}</code></p>
      <p>{detail.body}</p>
      <h4>Fichiers modifiés</h4>
      {detail.filesTruncated && <p>Liste des fichiers tronquée par les limites de GitHub.</p>}
      <ul>{detail.files.map((file) => <li key={file.path}>
        {file.path} · {file.status} · +{file.additions}/-{file.deletions}
      </li>)}</ul>
    </section>}
  </section>;
}

export function GitHubWorkspacePicker({ workspaces, isConfigured }: {
  workspaces: Array<{ id: string; name: string; role: "owner" | "admin" | "member" }>;
  isConfigured: boolean;
}) {
  const [workspaceId, setWorkspaceId] = useState(workspaces[0]?.id ?? "");
  const selected = workspaces.find((workspace) => workspace.id === workspaceId);
  return <section aria-label="GitHub par Workspace">
    {workspaces.length > 1 && <div>
      <label htmlFor="github-workspace">Workspace GitHub</label>
      <select id="github-workspace" value={workspaceId} onChange={(event) => setWorkspaceId(event.target.value)}>
        {workspaces.map((workspace) => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}
      </select>
    </div>}
    {workspaceId ? <GitHubConnection key={workspaceId} workspaceId={workspaceId}
      canInstall={selected?.role === "owner" || selected?.role === "admin"}
      isConfigured={isConfigured}/> :
      <p>Créez d’abord un Workspace pour y connecter GitHub.</p>}
  </section>;
}
