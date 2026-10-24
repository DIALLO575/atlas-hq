"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { BrandLogo } from "@/components/brand-logo";
import { Icon } from "@/components/icon";

type Space = { id: string; name: string; role: "owner" | "admin" | "member" };
type Installation = {
  installationId: number; status: string; repositorySelection: string | null;
  ownershipVerifiedAt: string | null; repositoriesVerifiedAt: string | null;
  isLive: boolean;
};
type Repository = { id: number; fullName: string; htmlUrl: string; private: boolean; defaultBranch: string | null };
type Pull = { number: number; title: string; htmlUrl: string; state: string; draft: boolean; headSha: string | null; updatedAt: string | null };
type FileChange = { path: string; status: string; additions: number; deletions: number; patch: string | null };
type PullDetail = {
  title: string; body: string | null; state: string; draft: boolean;
  updatedAt: string | null; htmlUrl: string;
  resource: { headSha: string };
  files: FileChange[]; filesTruncated: boolean;
};
type Pane = "overview" | "repositories" | "pulls" | "agents" | "automations" | "settings";
type LoadState = "connections" | "repositories" | "pulls" | "detail" | null;
type Failure = { stage: "connections" | "repositories" | "pulls" | "detail"; message: string } | null;

const tabs: { id: Pane; label: string; icon: "grid" | "layers" | "activity" | "bot" | "spark" | "settings" }[] = [
  { id: "overview", label: "Vue générale", icon: "grid" },
  { id: "repositories", label: "Dépôts", icon: "layers" },
  { id: "pulls", label: "Pull Requests", icon: "activity" },
  { id: "agents", label: "Agents IA", icon: "bot" },
  { id: "automations", label: "Automatisations", icon: "spark" },
  { id: "settings", label: "Connexion", icon: "settings" },
];

const errors: Record<string, string> = {
  AUTH_REQUIRED: "Votre session a expiré. Reconnectez-vous à Atlas.",
  AUTH_UNAVAILABLE: "Authentification momentanément indisponible.",
  WORKSPACE_FORBIDDEN: "Vous n’avez pas accès à ce workspace.",
  WORKSPACE_UNAVAILABLE: "Droits du workspace indisponibles.",
  GITHUB_NOT_AUTHORIZED: "Cette installation ou ce dépôt n’est pas autorisé dans ce workspace.",
  GITHUB_NOT_CONFIGURED: "La GitHub App doit être configurée côté serveur.",
  GITHUB_UNAVAILABLE: "GitHub est momentanément indisponible.",
  CONNECTIONS_UNAVAILABLE: "Les connexions ne peuvent pas être chargées.",
  PERMISSION_DENIED: "Accès GitHub refusé pour cette ressource.",
  RATE_LIMITED: "GitHub limite actuellement les lectures. Réessayez plus tard.",
  NOT_FOUND_OR_HIDDEN: "Cette ressource est introuvable ou privée.",
};

async function githubRead<T>(params: Record<string, string>): Promise<T> {
  const query = new URLSearchParams(params);
  const response = await fetch("/api/apps/github?" + query.toString(), {
    method: "GET", cache: "no-store", credentials: "same-origin",
  });
  if (!response.ok) {
    let code = "";
    try { const result = await response.json(); code = String(result?.error ?? ""); } catch {}
    throw new Error(errors[code] ?? "La lecture des données GitHub a échoué.");
  }
  return response.json() as Promise<T>;
}

function formatDate(value: string | null) {
  if (!value) return "Date inconnue";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Date inconnue" :
    new Intl.DateTimeFormat("fr", { day: "2-digit", month: "short", year: "numeric" }).format(date);
}
function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("fr");
}

export function GitHubControlCenter({ workspaces, initialWorkspaceId, configured }: {
  workspaces: Space[]; initialWorkspaceId: string; configured: boolean;
}) {
  const [workspaceId, setWorkspaceId] = useState(initialWorkspaceId);
  const workspace = workspaces.find((item) => item.id === workspaceId);
  return (
    <>
      <header className="atlas-gh-hero">
        <div className="atlas-gh-identity">
          <span className="atlas-gh-mark"><BrandLogo slug="github" size={45} /></span>
          <div><p className="atlas-overline">INTÉGRATION · GITHUB</p><h1>GitHub Control Center</h1>
            <p>Dépôts et Pull Requests de vos workspaces, au même endroit.</p></div>
        </div>
        {workspaces.length > 0 && (
          <label className="atlas-gh-workspace-pick">Workspace
            <select value={workspaceId} onChange={(event) => setWorkspaceId(event.target.value)}>
              {workspaces.map((space) => <option value={space.id} key={space.id}>{space.name}</option>)}
            </select>
          </label>
        )}
      </header>
      {workspace ? (
        <WorkspaceGitHub key={workspace.id} workspace={workspace} configured={configured} />
      ) : (
        <section className="atlas-gh-empty"><Icon name="layers" /><h2>Créez un workspace</h2>
          <p>Les connexions GitHub sont isolées par workspace. Créez-en un pour commencer.</p>
          <Link href="/workspaces">Gérer mes workspaces <Icon name="arrow-right" /></Link>
        </section>
      )}
    </>
  );
}

function WorkspaceGitHub({ workspace, configured }: { workspace: Space; configured: boolean }) {
  const [installations, setInstallations] = useState<Installation[]>([]);
  const [installationId, setInstallationId] = useState<number | null>(null);
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [repoTruncated, setRepoTruncated] = useState(false);
  const [repositoryId, setRepositoryId] = useState<number | null>(null);
  const [pulls, setPulls] = useState<Pull[]>([]);
  const [pullsTruncated, setPullsTruncated] = useState(false);
  const [detail, setDetail] = useState<PullDetail | null>(null);
  const [detailNumber, setDetailNumber] = useState<number | null>(null);
  const [tab, setTab] = useState<Pane>("overview");
  const [query, setQuery] = useState("");
  const [visibility, setVisibility] = useState<"all" | "private" | "public">("all");
  const [loadState, setLoadState] = useState<LoadState>("connections");
  const [failure, setFailure] = useState<Failure>(null);
  const selectedRepository = repositories.find((repo) => repo.id === repositoryId);
  const canInstall = workspace.role === "owner" || workspace.role === "admin";
  const readyInstallations = installations.filter((item) =>
    item.status === "repositories-ready" && ["selected", "all"].includes(item.repositorySelection ?? "") &&
    item.ownershipVerifiedAt && item.repositoriesVerifiedAt);
  const busy = loadState !== null;
  const prefix = useMemo(() => ({ workspaceId: workspace.id }), [workspace.id]);

  const loadPulls = useCallback(async (selectedInstall: number, selectedRepo: number) => {
    setRepositoryId(selectedRepo);
    setPulls([]); setDetail(null); setDetailNumber(null); setFailure(null); setLoadState("pulls");
    try {
      const data = await githubRead<{ pullRequests: Pull[]; truncated: boolean }>({
        ...prefix, view: "pulls", installationId: String(selectedInstall), repositoryId: String(selectedRepo),
      });
      setPulls(data.pullRequests);
      setPullsTruncated(data.truncated);
    } catch (error) {
      setFailure({ stage: "pulls", message: error instanceof Error ? error.message : "Lecture impossible." });
    } finally { setLoadState(null); }
  }, [prefix]);

  const loadRepositories = useCallback(async (selectedInstall: number) => {
    setInstallationId(selectedInstall);
    setRepositories([]); setPulls([]); setDetail(null); setRepositoryId(null);
    setRepoTruncated(false); setFailure(null); setLoadState("repositories");
    try {
      const data = await githubRead<{ repositories: Repository[]; truncated: boolean }>({
        ...prefix, view: "repositories", installationId: String(selectedInstall),
      });
      setRepositories(data.repositories);
      setRepoTruncated(data.truncated);
      setLoadState(null);
      if (data.repositories.length > 0) await loadPulls(selectedInstall, data.repositories[0].id);
    } catch (error) {
      setFailure({ stage: "repositories", message: error instanceof Error ? error.message : "Lecture impossible." });
      setLoadState(null);
    }
  }, [prefix, loadPulls]);

  useEffect(() => {
    let active = true;
    void githubRead<{ installations: Installation[] }>({ ...prefix, view: "connections" })
      .then((data) => {
        if (!active) return;
        setInstallations(data.installations);
        setLoadState(null);
        const ready = data.installations.find((item) =>
          item.status === "repositories-ready" && ["selected", "all"].includes(item.repositorySelection ?? "") &&
          item.ownershipVerifiedAt && item.repositoriesVerifiedAt);
        if (ready) void loadRepositories(ready.installationId);
      })
      .catch((error: unknown) => {
        if (!active) return;
        setLoadState(null);
        setFailure({ stage: "connections", message: error instanceof Error ? error.message : "Connexions indisponibles." });
      });
    return () => { active = false; };
  }, [prefix, loadRepositories]);

  async function openPull(number: number) {
    if (installationId === null || repositoryId === null) return;
    setDetailNumber(number); setDetail(null); setFailure(null); setLoadState("detail");
    try {
      const data = await githubRead<PullDetail>({
        ...prefix, view: "pull", installationId: String(installationId),
        repositoryId: String(repositoryId), pullNumber: String(number),
      });
      setDetail(data);
    } catch (error) {
      setFailure({ stage: "detail", message: error instanceof Error ? error.message : "Détails indisponibles." });
    } finally { setLoadState(null); }
  }

  function chooseTab(next: Pane) { setTab(next); setQuery(""); }
  const filteredRepos = repositories.filter((repo) =>
    (visibility === "all" || (visibility === "private" ? repo.private : !repo.private)) &&
    normalize(repo.fullName).includes(normalize(query)));
  const filteredPulls = pulls.filter((pull) =>
    normalize(pull.title + " #" + pull.number).includes(normalize(query)));
  const summary = [
    { label: "Dépôts autorisés", value: repoTruncated ? repositories.length + "+" : String(repositories.length), icon: "layers" as const, hint: "Installation choisie" },
    { label: "PR ouvertes", value: repositoryId === null ? "—" : pullsTruncated ? pulls.length + "+" : String(pulls.length), icon: "activity" as const, hint: "Dépôt sélectionné" },
    { label: "Installations vérifiées", value: String(readyInstallations.length), icon: "link" as const, hint: "Dans ce workspace" },
  ];

  return (
    <>
      <div className="atlas-gh-connection-strip">
        <div className="atlas-gh-connection-label">
          <span className={"atlas-gh-state-dot" + (readyInstallations.length ? " is-ready" : "")}/>
          <strong>{loadState === "connections" ? "Vérification en cours" : readyInstallations.length ? "Installation vérifiée" : "GitHub non connecté"}</strong>
          <span>{workspace.name} · Lecture seule</span>
        </div>
        <div className="atlas-gh-install-controls">
          {readyInstallations.length > 1 && <label>Installation
            <select disabled={busy} value={installationId ?? ""}
              onChange={(event) => void loadRepositories(Number(event.target.value))}>
              {readyInstallations.map((item) => <option key={item.installationId} value={item.installationId}>#{item.installationId}</option>)}
            </select>
          </label>}
          <button type="button" className="atlas-gh-refresh" disabled={busy || installationId === null} onClick={() => {
            if (installationId !== null) void loadRepositories(installationId);
          }}><Icon name="rotate-ccw" /> Actualiser</button>
          <button type="button" onClick={() => chooseTab("settings")} className="atlas-gh-minor-action">
            <Icon name="settings" /> Connexion
          </button>
        </div>
      </div>

      <section className="atlas-gh-stats" aria-label="Indicateurs GitHub réels">
        {summary.map((item) => <article key={item.label} className="atlas-gh-stat">
          <span className="atlas-gh-stat-icon"><Icon name={item.icon}/></span>
          <div><strong>{busy && item.label !== "Installations vérifiées" ? "…" : item.value}</strong><span>{item.label}</span><small>{item.hint}</small></div>
        </article>)}
      </section>

      <div className="atlas-gh-tabs" role="tablist" aria-label="Rubriques GitHub">
        {tabs.map((item) => <button role="tab" key={item.id} type="button" aria-selected={tab === item.id}
          className={tab === item.id ? "is-active" : ""} onClick={() => chooseTab(item.id)}>
          <Icon name={item.icon}/>{item.label}
        </button>)}
      </div>

      {loadState && <p className="atlas-gh-loading" role="status"><Icon name="rotate-ccw" /> Chargement des données GitHub…</p>}
      {failure && <div className="atlas-gh-notice" role="alert">{failure.message}
        {failure.stage === "repositories" && installationId !== null && <button onClick={() => void loadRepositories(installationId)}>Réessayer</button>}
        {failure.stage === "pulls" && installationId !== null && repositoryId !== null && <button onClick={() => void loadPulls(installationId, repositoryId)}>Réessayer</button>}
        {failure.stage === "connections" && <Link href="/apps/github">Réessayer</Link>}
      </div>}
      {!configured && <div className="atlas-gh-notice">La GitHub App doit être configurée sur le serveur pour activer la connexion.</div>}

      {(tab === "overview" || tab === "repositories" || tab === "pulls") && (
        <div className="atlas-gh-content">
          <section className="atlas-gh-primary">
            <div className="atlas-gh-section-heading"><div>
              <h2>{tab === "repositories" ? "Dépôts autorisés" : tab === "pulls" ? "Pull Requests ouvertes" : "Activité des Pull Requests"}</h2>
              <p>{tab === "repositories" ? "Uniquement les dépôts accordés à Atlas." : "Lecture GitHub en direct · Dépôt sélectionné"}</p>
            </div>
              {tab !== "repositories" && selectedRepository && <a href={selectedRepository.htmlUrl} target="_blank" rel="noopener noreferrer">
                Ouvrir le dépôt <Icon name="arrow-up-right"/></a>}
            </div>
            {repositories.length > 0 && <div className="atlas-gh-repo-toolbar">
              <label className="atlas-gh-select-label">Dépôt
                <select value={repositoryId ?? ""} disabled={busy} onChange={(event) => {
                  if (installationId !== null) void loadPulls(installationId, Number(event.target.value));
                }}>
                  {repositories.map((repo) => <option value={repo.id} key={repo.id}>{repo.fullName}</option>)}
                </select>
              </label>
              <label className="atlas-gh-search"><Icon name="search"/><span className="sr-only">Rechercher</span>
                <input type="search" value={query} onChange={(event) => setQuery(event.target.value)}
                  placeholder={tab === "repositories" ? "Rechercher un dépôt…" : "Rechercher une PR…"}/>
              </label>
              {tab === "repositories" && <select className="atlas-gh-visibility" aria-label="Visibilité" value={visibility}
                onChange={(event) => setVisibility(event.target.value as typeof visibility)}>
                <option value="all">Tous</option><option value="private">Privés</option><option value="public">Publics</option>
              </select>}
            </div>}
            {tab === "repositories" ? (
              <div className="atlas-gh-list">
                {filteredRepos.map((repo) => <button type="button" key={repo.id}
                  onClick={() => {
                    if (installationId !== null) { void loadPulls(installationId, repo.id); setTab("pulls"); setQuery(""); }
                  }}
                  className={"atlas-gh-list-row" + (repo.id === repositoryId ? " is-selected" : "")} disabled={busy}>
                  <span className="atlas-gh-row-icon"><BrandLogo slug="github" size={23}/></span>
                  <span className="atlas-gh-row-copy"><strong>{repo.fullName}</strong><small>{repo.private ? "Privé" : "Public"} · {repo.defaultBranch ?? "Branche non indiquée"}</small></span>
                  <span className="atlas-gh-ghost-link">Voir les PR <Icon name="arrow-right"/></span>
                </button>)}
                {!busy && filteredRepos.length === 0 && <div className="atlas-gh-no-data">Aucun dépôt autorisé ne correspond à cette recherche.</div>}
                {repoTruncated && <p className="atlas-gh-truncated">Liste partielle : limite de lecture GitHub atteinte.</p>}
              </div>
            ) : (
              <div className="atlas-gh-list">
                {filteredPulls.map((pull) => <button type="button" key={pull.number}
                  className={"atlas-gh-list-row" + (detailNumber === pull.number ? " is-selected" : "")}
                  onClick={() => void openPull(pull.number)} disabled={busy}>
                  <span className="atlas-gh-row-icon"><Icon name="activity" /></span>
                  <span className="atlas-gh-row-copy"><strong>#{pull.number} · {pull.title}</strong>
                    <small>{selectedRepository?.fullName} · Mis à jour le {formatDate(pull.updatedAt)}</small></span>
                  <span className={"atlas-gh-pill" + (pull.draft ? " is-muted" : "")}>{pull.draft ? "Brouillon" : "Ouverte"}</span>
                  <Icon name="chevron-right"/>
                </button>)}
                {!busy && filteredPulls.length === 0 && <div className="atlas-gh-no-data">
                  {repositoryId === null ? "Sélectionnez une installation et un dépôt." :
                    "Aucune Pull Request ouverte ne correspond à ce dépôt ou à votre recherche."}
                </div>}
                {pullsTruncated && <p className="atlas-gh-truncated">Au moins {pulls.length} PR : liste limitée aux 100 premières.</p>}
              </div>
            )}
          </section>
          <aside className="atlas-gh-secondary">
            <section className="atlas-gh-detail-panel">
              <div className="atlas-gh-section-heading"><h2>Détails de PR</h2><span className="atlas-gh-readonly">Lecture seule</span></div>
              {detail ? <>
                <h3>#{detailNumber} · {detail.title}</h3>
                <p className="atlas-gh-detail-body">{detail.body || "Aucune description fournie."}</p>
                <div className="atlas-gh-sha">Révision <code>{detail.resource.headSha.slice(0, 12)}</code></div>
                <div className="atlas-gh-files-head"><strong>Fichiers modifiés</strong><span>{detail.filesTruncated ? detail.files.length + "+" : detail.files.length}</span></div>
                <div className="atlas-gh-files">{detail.files.map((file) =>
                  <div key={file.path} className="atlas-gh-file"><span title={file.path}>{file.path}</span>
                    <small>+{file.additions} / -{file.deletions}</small></div>)}</div>
                {detail.filesTruncated && <p className="atlas-gh-truncated">Liste partielle.</p>}
                <a className="atlas-gh-primary-action" href={detail.htmlUrl} target="_blank" rel="noopener noreferrer">
                  Ouvrir la PR sur GitHub <Icon name="arrow-up-right"/></a>
              </> : <div className="atlas-gh-detail-empty"><Icon name="activity" />
                <p>Sélectionnez une PR pour consulter ses fichiers et sa révision réelle.</p></div>}
            </section>
          </aside>
        </div>
      )}

      {tab === "settings" && <section className="atlas-gh-panel atlas-gh-settings">
        <div className="atlas-gh-section-heading"><div><h2>Connexion GitHub</h2><p>Workspace : {workspace.name}</p></div></div>
        <div className="atlas-gh-install-list">
          {installations.length ? installations.map((item) => <div key={item.installationId}>
            <strong>Installation #{item.installationId}</strong><span>{item.status === "repositories-ready" ? "Vérifiée" : "En attente de vérification"}</span>
          </div>) : <p>Aucune installation enregistrée dans ce workspace.</p>}
        </div>
        {canInstall && configured ? <form method="post" action="/api/apps/github/connect/start">
          <input type="hidden" name="workspaceId" value={workspace.id}/>
          <button className="atlas-gh-primary-action" type="submit"><Icon name="link"/> Installer ou reconnecter GitHub</button>
          <p>Sur GitHub, vous pouvez choisir « All repositories » (actuels et futurs) ou « Only select repositories ». ATLAS vérifiera le propriétaire et limitera la connexion à la lecture des Pull Requests.</p>
        </form> : <p className="atlas-gh-notice">{!configured
          ? "La GitHub App ATLAS HQ n’est pas configurée."
          : "Seuls les administrateurs et propriétaires peuvent autoriser une installation."}</p>}
        <p className="atlas-gh-settings-foot">Les connexions et dépôts appartiennent au workspace. Aucun changement de permissions depuis cet écran.</p>
      </section>}

      {(tab === "agents" || tab === "automations") && <section className="atlas-gh-panel atlas-gh-future">
        <span className="atlas-gh-future-icon"><Icon name={tab === "agents" ? "bot" : "spark"}/></span>
        <h2>{tab === "agents" ? "Analyse par agents IA" : "Automatisations GitHub"}</h2>
        <p>{tab === "agents"
          ? "L’analyse de PR par un agent n’est pas encore raccordée. Les dépôts et fichiers sont consultables en lecture seule."
          : "Les déclencheurs après push, les notifications et les validations automatiques nécessitent un service de webhooks et une autorisation explicite."}</p>
        <span className="atlas-gh-coming">Fonctionnalité à venir · Aucune action déclenchée</span>
      </section>}

      <p className="atlas-gh-footnote">Données GitHub réelles uniquement après autorisation de la GitHub App. Aucune action sur le code, merge ou validation automatique.</p>
    </>
  );
}
