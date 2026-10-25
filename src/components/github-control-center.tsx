"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BrandLogo } from "@/components/brand-logo";
import { Icon } from "@/components/icon";
import { GitHubStudioRepositoryWizard } from "@/components/github-studio-repository-wizard";
import { GitHubActionsControlCenter } from "@/components/github-actions-control-center";

type Workspace = { id: string; name: string; role: "owner" | "admin" | "member" };
type Installation = {
  installationId: number; status: string; repositorySelection: string | null;
  ownershipVerifiedAt: string | null; repositoriesVerifiedAt: string | null; isLive: boolean;
};
type Repository = { id: number; fullName: string; htmlUrl: string; private: boolean; defaultBranch: string | null };
type Pull = { number: number; title: string; htmlUrl: string; state: string; draft: boolean; updatedAt: string | null; headSha: string | null };
type FileChange = { path: string; status: string; additions: number; deletions: number; patch: string | null };
type PullDetail = {
  title: string; body: string | null; state: string; draft: boolean; merged: boolean;
  updatedAt: string | null; htmlUrl: string; resource: { headSha: string };
  files: FileChange[]; filesTruncated: boolean;
};
type Section = "overview" | "repositories" | "pulls" | "actions" | "studio" | "settings";
type Loading = "connections" | "repositories" | "pulls" | "detail" | null;

const labels: Record<string, string> = {
  AUTH_REQUIRED: "Votre session Atlas a expiré. Reconnectez-vous.",
  AUTH_UNAVAILABLE: "Authentification indisponible.",
  WORKSPACE_FORBIDDEN: "Accès refusé à ce workspace.",
  WORKSPACE_UNAVAILABLE: "Impossible de vérifier vos droits.",
  GITHUB_NOT_AUTHORIZED: "Installation ou dépôt non autorisé pour ce workspace.",
  GITHUB_NOT_CONFIGURED: "La GitHub App doit être configurée côté serveur.",
  NOT_CONFIGURED: "Impossible de signer un jeton GitHub App : vérifiez GITHUB_APP_ID et GITHUB_APP_PRIVATE_KEY sur Vercel Production.",
  GITHUB_UNAVAILABLE: "Impossible de contacter GitHub pour le moment.",
  CONNECTIONS_UNAVAILABLE: "Impossible de vérifier les connexions enregistrées.",
  PERMISSION_DENIED: "GitHub refuse l’accès à cette ressource.",
  NOT_FOUND_OR_HIDDEN: "Dépôt ou PR introuvable ou inaccessible.",
  RATE_LIMITED: "Limite de lecture GitHub atteinte. Réessayez plus tard.",
  INVALID_RESPONSE: "GitHub a renvoyé une réponse inattendue. Vérifiez la connexion et les journaux du serveur.",
  GITHUB_REJECTED: "GitHub a refusé la demande d’accès de l’App. Vérifiez ses permissions Pull Requests et que sa clé privée correspond à l’App installée.",
  PROVIDER_UNAVAILABLE: "Le serveur n’a pas réussi à joindre l’API GitHub. Réessayez et vérifiez les journaux Vercel.",
  INVALID_INPUT: "La configuration enregistrée pour cette installation GitHub est invalide. Réautorisez l’application dans ce workspace.",
  INCOMPLETE: "La liste des dépôts autorisés fournie par GitHub est incomplète. Réessayez ou réduisez la sélection.",
};

async function readGitHub<T>(params: Record<string, string>, signal: AbortSignal): Promise<T> {
  const response = await fetch("/api/apps/github?" + new URLSearchParams(params), {
    method: "GET", credentials: "same-origin", cache: "no-store", signal,
  });
  if (!response.ok) {
    let code = "";
    try { code = String((await response.json())?.error || ""); } catch {}
    throw new Error(labels[code] || "Lecture GitHub indisponible.");
  }
  return response.json() as Promise<T>;
}

function readableDate(raw: string | null) {
  if (!raw) return "Date indisponible";
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? "Date indisponible" :
    new Intl.DateTimeFormat("fr", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(date);
}
const lower = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("fr");
function verified(installation: Installation) {
  return installation.status === "repositories-ready" &&
    ["selected", "all"].includes(installation.repositorySelection ?? "") &&
    Boolean(installation.ownershipVerifiedAt && installation.repositoriesVerifiedAt);
}
const sections: { id: Section; title: string; caption: string; icon: "grid" | "layers" | "git-pull-request" | "workflow" | "plus-circle" | "settings" }[] = [
  { id: "overview", title: "Tableau de bord", caption: "Vue générale", icon: "grid" },
  { id: "repositories", title: "Mes dépôts", caption: "Explorer les projets", icon: "layers" },
  { id: "pulls", title: "Pull Requests", caption: "Révision du code", icon: "git-pull-request" },
  { id: "studio", title: "Création de dépôt", caption: "Repository Studio", icon: "plus-circle" },
  { id: "actions", title: "CI / Actions", caption: "Builds et diagnostics", icon: "workflow" },
  { id: "settings", title: "Connexions", caption: "Accès GitHub", icon: "settings" },
];
const sectionHelp: Record<Section, string> = {
  overview: "L'essentiel de votre activité GitHub.",
  repositories: "Tous les dépôts accessibles dans votre installation.",
  pulls: "Inspectez les Pull Requests et leurs diffs.",
  studio: "Préparez et approuvez la configuration d'un dépôt.",
  actions: "Surveillez les workflows et diagnostiquez les échecs.",
  settings: "Gérez les connexions et autorisations de GitHub.",
};

export function GitHubControlCenter({ workspaces, initialWorkspaceId, configured }: {
  workspaces: Workspace[]; initialWorkspaceId: string; configured: boolean;
}) {
  const [workspaceId, setWorkspaceId] = useState(initialWorkspaceId);
  const [focusMode, setFocusMode] = useState(false);
  useEffect(() => {
    if (!focusMode) return;
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setFocusMode(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = oldOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [focusMode]);
  const selected = workspaces.find((item) => item.id === workspaceId);
  return <div className={"atlas-gh-console" + (focusMode ? " is-focus" : "")}>
    <header className="atlas-gh-hero">
      <div className="atlas-gh-identity">
        <span className="atlas-gh-mark"><BrandLogo slug="github" size={29} /></span>
        <div>
          <p className="atlas-overline">ATLAS / GITHUB CONNECT</p>
          <h1>GitHub <span>Workspace</span></h1>
          <p>Dépôts, Pull Requests et pipelines au même endroit.</p>
        </div>
      </div>
      <div className="atlas-gh-header-actions">
        {workspaces.length > 0 && <label className="atlas-gh-workspace-pick">Workspace
          <select value={workspaceId} onChange={(event) => setWorkspaceId(event.target.value)}>
            {workspaces.map((space) => <option value={space.id} key={space.id}>{space.name}</option>)}
          </select>
        </label>}
        <button type="button" className="atlas-gh-focus-toggle" aria-pressed={focusMode}
          aria-label={focusMode ? "Quitter le mode plein écran GitHub" : "Ouvrir GitHub en plein écran"}
          title={focusMode ? "Quitter le plein écran (Échap)" : "Piloter GitHub en plein écran"}
          onClick={() => setFocusMode((current) => !current)}>
          <Icon name={focusMode ? "minimize" : "maximize"}/>
          <span>{focusMode ? "Quitter le plein écran" : "Plein écran"}</span>
        </button>
      </div>
    </header>
    {selected
      ? <WorkspaceGitHub key={selected.id} workspace={selected} configured={configured} />
      : <section className="atlas-gh-empty"><Icon name="layers"/><h2>Aucun workspace</h2>
        <p>Créez un espace pour rattacher une connexion GitHub et ses dépôts autorisés.</p>
        <Link href="/workspaces">Ouvrir Workspaces <Icon name="arrow-right"/></Link>
      </section>}
  </div>;
}

function WorkspaceGitHub({ workspace, configured }: { workspace: Workspace; configured: boolean }) {
  const [installations, setInstallations] = useState<Installation[]>([]);
  const [installationId, setInstallationId] = useState<number | null>(null);
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [repositoriesTruncated, setRepositoriesTruncated] = useState(false);
  const [repositoryId, setRepositoryId] = useState<number | null>(null);
  const [pulls, setPulls] = useState<Pull[]>([]);
  const [pullsTruncated, setPullsTruncated] = useState(false);
  const [detail, setDetail] = useState<PullDetail | null>(null);
  const [detailNumber, setDetailNumber] = useState<number | null>(null);
  const [expandedFile, setExpandedFile] = useState<string | null>(null);
  const [visibleFileCount, setVisibleFileCount] = useState(35);
  const [section, setSection] = useState<Section>("overview");
  const [search, setSearch] = useState("");
  const [visibility, setVisibility] = useState<"all" | "public" | "private">("all");
  const [loading, setLoading] = useState<Loading>("connections");
  const [problem, setProblem] = useState<string | null>(null);
  const [lastSynced, setLastSynced] = useState<string | null>(null);
  const requestRef = useRef<AbortController | null>(null);
  const canInstall = workspace.role === "owner" || workspace.role === "admin";
  const ready = installations.filter(verified);
  const selectedRepo = repositories.find((repo) => repo.id === repositoryId);
  const hasLiveRepositories = lastSynced !== null;

  const newRequest = useCallback(() => {
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    return controller;
  }, []);
  const failIfActive = useCallback((error: unknown, controller: AbortController) => {
    if (!controller.signal.aborted) setProblem(error instanceof Error ? error.message : "Lecture indisponible.");
  }, []);

  const openRepository = useCallback(async (newInstallation: number, newRepository: number) => {
    const controller = newRequest();
    setRepositoryId(newRepository);
    setPulls([]); setPullsTruncated(false); setDetail(null); setDetailNumber(null); setExpandedFile(null); setVisibleFileCount(35);
    setProblem(null); setLoading("pulls");
    try {
      const result = await readGitHub<{ pullRequests: Pull[]; truncated: boolean }>({
        workspaceId: workspace.id, view: "pulls",
        installationId: String(newInstallation), repositoryId: String(newRepository),
      }, controller.signal);
      if (controller.signal.aborted) return;
      setPulls(result.pullRequests); setPullsTruncated(result.truncated);
    } catch (error) { failIfActive(error, controller); }
    finally { if (!controller.signal.aborted) setLoading(null); }
  }, [newRequest, workspace.id, failIfActive]);

  const openInstallation = useCallback(async (newInstallation: number) => {
    const controller = newRequest();
    setInstallationId(newInstallation); setRepositories([]); setRepositoryId(null);
    setPulls([]); setDetail(null); setDetailNumber(null); setRepositoriesTruncated(false);
    setPullsTruncated(false); setLastSynced(null); setProblem(null); setLoading("repositories");
    try {
      const result = await readGitHub<{ repositories: Repository[]; truncated: boolean }>({
        workspaceId: workspace.id, view: "repositories", installationId: String(newInstallation),
      }, controller.signal);
      if (controller.signal.aborted) return;
      setRepositories(result.repositories); setRepositoriesTruncated(result.truncated);
      setLastSynced(new Date().toISOString());
      if (result.repositories.length) {
        await openRepository(newInstallation, result.repositories[0].id);
      } else {
        setLoading(null);
      }
    } catch (error) { failIfActive(error, controller); }
    finally { if (!controller.signal.aborted && !requestRef.current?.signal.aborted) setLoading(null); }
  }, [newRequest, openRepository, workspace.id, failIfActive]);

  const refreshConnections = useCallback(async () => {
    const controller = newRequest();
    setLoading("connections"); setProblem(null); setInstallations([]);
    setInstallationId(null); setRepositories([]); setRepositoryId(null); setPulls([]);
    setDetail(null); setDetailNumber(null); setLastSynced(null);
    try {
      const result = await readGitHub<{ installations: Installation[] }>({
        workspaceId: workspace.id, view: "connections",
      }, controller.signal);
      if (controller.signal.aborted) return;
      setInstallations(result.installations);
      const firstReady = result.installations.find(verified);
      if (firstReady) await openInstallation(firstReady.installationId);
      else setLoading(null);
    } catch (error) { failIfActive(error, controller); }
    finally { if (!controller.signal.aborted && !requestRef.current?.signal.aborted) setLoading(null); }
  }, [workspace.id, newRequest, openInstallation, failIfActive]);

  useEffect(() => {
    // Also abort outstanding requests when switching workspace/unmounting.
    const frame = window.requestAnimationFrame(() => { void refreshConnections(); });
    return () => { window.cancelAnimationFrame(frame); requestRef.current?.abort(); };
  }, [refreshConnections]);

  async function openPull(number: number) {
    if (installationId === null || repositoryId === null) return;
    const controller = newRequest();
    setDetailNumber(number); setDetail(null); setExpandedFile(null); setVisibleFileCount(35); setProblem(null); setLoading("detail");
    try {
      const result = await readGitHub<PullDetail>({
        workspaceId: workspace.id, view: "pull", installationId: String(installationId),
        repositoryId: String(repositoryId), pullNumber: String(number),
      }, controller.signal);
      if (controller.signal.aborted) return;
      setDetail(result);
      // Open the first available patch in the dedicated code pane.
      setExpandedFile(result.files.slice(0, 35).find((file) => file.patch)?.path ?? result.files[0]?.path ?? null);
    } catch (error) { failIfActive(error, controller); }
    finally { if (!controller.signal.aborted) setLoading(null); }
  }

  const matchingRepos = useMemo(() => repositories.filter((repo) =>
    (visibility === "all" || (visibility === "private" ? repo.private : !repo.private)) &&
    lower(repo.fullName).includes(lower(search.trim()))), [repositories, search, visibility]);
  const matchingPulls = useMemo(() => pulls.filter((pr) =>
    lower(pr.title + " #" + pr.number).includes(lower(search.trim()))), [pulls, search]);
  const summary = [
    { label: "Dépôts autorisés", number: hasLiveRepositories ? String(repositories.length) + (repositoriesTruncated ? "+" : "") : "—", desc: "Installation sélectionnée", icon: "layers" as const },
    { label: "PR ouvertes", number: repositoryId !== null && loading !== "pulls" && !problem ? String(pulls.length) + (pullsTruncated ? "+" : "") : "—", desc: "Dépôt sélectionné", icon: "activity" as const },
    { label: "Installations vérifiées", number: loading === "connections" ? "—" : String(ready.length), desc: "Votre workspace", icon: "link" as const },
  ];
  const status = problem ? "error" : hasLiveRepositories ? "live" : ready.length ? "verified" : "empty";
  const displayPulls = section === "pulls";

  return <>
    <div className="atlas-gh-connection-strip">
      <div className="atlas-gh-connection-label">
        <span className={"atlas-gh-state-dot" + (status === "live" ? " is-ready" : "")}/>
        <strong>{loading === "connections" ? "Vérification…" : status === "error" ? "Connexion à vérifier" :
          status === "live" ? "GitHub accessible" : status === "verified" ? "Installation enregistrée" : "Non connecté"}</strong>
        <span>{lastSynced ? "Données récupérées le " + readableDate(lastSynced) : "Aucun accès GitHub live confirmé"} · {workspace.name}</span>
      </div>
      <div className="atlas-gh-install-controls">
        {ready.length > 1 && <label>Installation
          <select disabled={loading !== null} value={installationId ?? ""}
            onChange={(event) => void openInstallation(Number(event.target.value))}>
            {ready.map((item) => <option key={item.installationId} value={item.installationId}>#{item.installationId}</option>)}
          </select>
        </label>}
        <button className="atlas-gh-refresh" type="button" disabled={loading !== null}
          onClick={() => void refreshConnections()}><Icon name="rotate-ccw"/> Synchroniser</button>
        <button className="atlas-gh-minor-action" type="button" onClick={() => setSection("settings")}>
          <Icon name="settings"/> Connexion
        </button>
      </div>
    </div>

    {ready.length === 0 && loading === null && !problem && <section className="atlas-gh-setup">
      <span className="atlas-gh-setup-emblem"><BrandLogo slug="github" size={32}/></span>
      <div><h2>Reliez votre premier dépôt GitHub</h2>
        <p>L’installation GitHub est autorisée par un administrateur du workspace. Sélectionnez seulement les dépôts nécessaires.</p></div>
      {configured && canInstall ? <form method="post" action="/api/apps/github/connect/start">
        <input type="hidden" name="workspaceId" value={workspace.id}/>
        <button type="submit"><Icon name="link"/> Connecter GitHub <Icon name="arrow-up-right"/></button>
      </form> : <button type="button" onClick={() => setSection("settings")}>
        {configured ? "Voir les autorisations" : "Configuration requise"} <Icon name="arrow-right"/></button>}
    </section>}



    <div className="atlas-gh-workbench">
      <nav className="atlas-gh-tabs" aria-label="Espaces GitHub">
        <span className="atlas-gh-nav-overline">ESPACES</span>
        {sections.map((item) => <button key={item.id} type="button"
          aria-current={section === item.id ? "page" : undefined}
          className={section === item.id ? "is-active" : ""}
          onClick={() => { setSection(item.id); setSearch(""); }}>
          <span className="atlas-gh-nav-icon"><Icon name={item.icon}/></span>
          <span className="atlas-gh-nav-copy"><strong>{item.title}</strong><small>{item.caption}</small></span>
          {section === item.id && <span className="atlas-gh-nav-dot" aria-hidden="true"/>}
        </button>)}
        <div className="atlas-gh-nav-bottom"><Icon name="shield-check"/>
          <span>Accès vérifié<br/>par workspace Atlas</span>
        </div>
      </nav>
      <div className="atlas-gh-workbench-body">
        <div className="atlas-gh-view-title">
          <div><p className="atlas-gh-eyebrow">GITHUB / {sections.find((item) => item.id === section)?.title.toUpperCase()}</p>
            <h2>{sections.find((item) => item.id === section)?.title}</h2>
            <p>{sectionHelp[section]}</p>
          </div>
          <span className="atlas-gh-view-flag"><Icon name="shield-check"/> Accès contrôlé</span>
        </div>

    {section === "overview" && <div className="atlas-gh-overview">
      <section className="atlas-gh-overview-welcome">
        <div className="atlas-gh-overview-welcome-copy">
          <span className="atlas-gh-overview-flag"><Icon name="git-branch"/> VOTRE CENTRE DE PILOTAGE</span>
          <h3>Gardez le contrôle de vos projets GitHub.</h3>
          <p>Accédez à vos dépôts, révisez le code et suivez les workflows sans changer de contexte.</p>
          <div className="atlas-gh-overview-actions">
            <button type="button" onClick={() => setSection("pulls")}><Icon name="git-pull-request"/> Examiner les PR <Icon name="arrow-right"/></button>
            <button type="button" onClick={() => setSection("actions")}><Icon name="workflow"/> Voir la CI/CD</button>
          </div>
        </div>
        <div className="atlas-gh-overview-glyph" aria-hidden="true"><BrandLogo slug="github" size={76}/><span>ATLAS · GITHUB</span></div>
      </section>
      <section className="atlas-gh-stats" aria-label="Indicateurs calculés à partir de GitHub">
        {summary.map((item) => <article key={item.label} className="atlas-gh-stat">
          <span className="atlas-gh-stat-icon"><Icon name={item.icon}/></span>
          <div><strong>{item.number}</strong><span>{item.label}</span><small>{item.desc}</small></div>
        </article>)}
      </section>
      <div className="atlas-gh-overview-grid">
        {([
          {id:"repositories",icon:"layers",title:"Mes dépôts",description:"Dépôts accessibles, branches et visibilité.",action:"Explorer"},
          {id:"pulls",icon:"git-pull-request",title:"Pull Requests",description:"Consultez les PR et inspectez les diffs.",action:"Réviser"},
          {id:"studio",icon:"plus-circle",title:"Création de dépôt",description:"Préparez votre projet et son approbation.",action:"Préparer"},
          {id:"actions",icon:"workflow",title:"CI / Actions",description:"Détectez les échecs dans vos pipelines.",action:"Diagnostiquer"},
        ] as const).map((item)=><button key={item.id} type="button" className="atlas-gh-overview-card"
          onClick={() => setSection(item.id)}>
          <span className="atlas-gh-overview-card-icon"><Icon name={item.icon}/></span>
          <strong>{item.title}</strong>
          <small>{item.description}</small>
          <span className="atlas-gh-overview-card-action">{item.action} <Icon name="arrow-up-right"/></span>
        </button>)}
      </div>
      <section className="atlas-gh-overview-activity">
        <div className="atlas-gh-section-heading">
          <div><h3>Pull Requests récentes</h3><p>{selectedRepo?.fullName ?? "Aucun dépôt sélectionné"}</p></div>
          <button type="button" onClick={() => setSection("pulls")}>Toutes les PR <Icon name="arrow-right"/></button>
        </div>
        {pulls.slice(0,4).map((pr)=><button type="button" className="atlas-gh-overview-pr" key={pr.number}
          onClick={() => { setSection("pulls"); void openPull(pr.number); }}>
          <Icon name="git-pull-request"/>
          <span><strong>#{pr.number} · {pr.title}</strong><small>{readableDate(pr.updatedAt)} · {pr.draft ? "Brouillon" : "Ouverte"}</small></span>
          <Icon name="chevron-right"/>
        </button>)}
        {pulls.length === 0 && <p className="atlas-gh-no-data">
          {loading ? "Chargement des Pull Requests…" : repositoryId === null
            ? "Aucun dépôt sélectionné." : "Aucune Pull Request ouverte dans ce dépôt."}
        </p>}
      </section>
    </div>}

    {loading && <p className="atlas-gh-loading" role="status"><Icon name="rotate-ccw"/> Lecture des données GitHub…</p>}
    {problem && <div className="atlas-gh-notice" role="alert">{problem}
      <button type="button" onClick={() => void refreshConnections()}>Réessayer</button>
    </div>}
    {!configured && <p className="atlas-gh-notice">Configuration de la GitHub App manquante côté serveur. Les données ne peuvent pas être chargées.</p>}

    {section === "studio" && <GitHubStudioRepositoryWizard key={`${workspace.id}:${installationId ?? "none"}`}
      workspaceId={workspace.id} installationId={installationId}
      canManage={canInstall} ready={ready.some((item) => item.installationId === installationId)} />}

    {section === "actions" && <GitHubActionsControlCenter key={`${workspace.id}:${installationId ?? "none"}`}
      workspaceId={workspace.id} installationId={installationId}
      repositories={repositories.map((item)=>({id:item.id,fullName:item.fullName}))}
      ready={ready.some((item)=>item.installationId===installationId)} />}

    {(section === "repositories" || section === "pulls") && <div className={"atlas-gh-content atlas-gh-content-v2" + (section === "repositories" ? " atlas-gh-repositories-only" : "")}>
      <section className="atlas-gh-primary">
        <div className="atlas-gh-section-heading">
          <div><h2>{section === "repositories" ? "Dépôts autorisés" : "Pull Requests ouvertes"}</h2>
            <p>{section === "repositories" ? "Accès accordés à cette installation" : selectedRepo?.fullName ?? "Sélectionnez un dépôt"}</p></div>
          {selectedRepo && displayPulls && <a href={selectedRepo.htmlUrl} target="_blank" rel="noopener noreferrer">
            GitHub <Icon name="arrow-up-right"/></a>}
        </div>
        <div className="atlas-gh-repo-toolbar">
          {repositories.length > 0 && displayPulls && <label className="atlas-gh-select-label">Dépôt
            <select disabled={loading !== null} value={repositoryId ?? ""}
              onChange={(event) => { if (installationId !== null) void openRepository(installationId, Number(event.target.value)); }}>
              {repositories.map((repo) => <option key={repo.id} value={repo.id}>{repo.fullName}</option>)}
            </select>
          </label>}
          <label className="atlas-gh-search"><Icon name="search"/><span className="sr-only">Rechercher</span>
            <input value={search} type="search" onChange={(event) => setSearch(event.target.value)}
              placeholder={displayPulls ? "Rechercher une PR…" : "Rechercher un dépôt…"}/></label>
          {section === "repositories" && <select className="atlas-gh-visibility"
            value={visibility} aria-label="Filtrer la visibilité"
            onChange={(event) => setVisibility(event.target.value as typeof visibility)}>
            <option value="all">Tous</option><option value="private">Privés</option><option value="public">Publics</option>
          </select>}
        </div>
        <div className="atlas-gh-list">
          {section === "repositories" ? <>
            {matchingRepos.map((repo) => <button className={"atlas-gh-list-row" + (repositoryId === repo.id ? " is-selected" : "")}
              type="button" key={repo.id} disabled={loading !== null}
              onClick={() => { if (installationId !== null) { setSection("pulls"); setSearch(""); void openRepository(installationId, repo.id); } }}>
              <span className="atlas-gh-row-icon"><BrandLogo slug="github" size={22}/></span>
              <span className="atlas-gh-row-copy"><strong>{repo.fullName}</strong>
                <small>{repo.private ? "Privé" : "Public"} · {repo.defaultBranch ?? "Branche inconnue"}</small></span>
              <span className="atlas-gh-ghost-link">Voir les PR <Icon name="arrow-right"/></span>
            </button>)}
            {repositoriesTruncated && <p className="atlas-gh-truncated">Liste partielle : limite GitHub atteinte.</p>}
            {!loading && matchingRepos.length === 0 && <div className="atlas-gh-no-data">
              {hasLiveRepositories ? "Aucun dépôt pour ce filtre." : "Connectez GitHub pour découvrir vos dépôts."}</div>}
          </> : <>
            {matchingPulls.map((pr) => <button key={pr.number} type="button"
              className={"atlas-gh-list-row" + (detailNumber === pr.number ? " is-selected" : "")}
              disabled={loading !== null} aria-pressed={detailNumber === pr.number} onClick={() => void openPull(pr.number)}>
              <span className="atlas-gh-row-icon"><Icon name="activity"/></span>
              <span className="atlas-gh-row-copy"><strong>#{pr.number} · {pr.title}</strong>
                <small>{readableDate(pr.updatedAt)} · {selectedRepo?.fullName}</small></span>
              <span className={"atlas-gh-pill" + (pr.draft ? " is-muted" : "")}>{pr.draft ? "Brouillon" : "Ouverte"}</span>
              <Icon name="chevron-right"/>
            </button>)}
            {pullsTruncated && <p className="atlas-gh-truncated">Au moins {pulls.length} PR ouvertes · lecture limitée.</p>}
            {!loading && matchingPulls.length === 0 && <div className="atlas-gh-no-data">
              {repositoryId === null ? "Sélectionnez un dépôt autorisé." : "Aucune PR ouverte pour ce dépôt ou cette recherche."}</div>}
          </>}
        </div>
      </section>
      {section === "pulls" && <aside className="atlas-gh-secondary">
        <section className="atlas-gh-detail-panel">
          <div className="atlas-gh-section-heading"><h2>Inspecteur de PR</h2><span className="atlas-gh-readonly">Lecture seule</span></div>
          {loading === "detail" && <p className="atlas-gh-loading" role="status">Chargement des modifications de la Pull Request…</p>}
          {detail ? <>
            <h3>#{detailNumber} · {detail.title}</h3>
            <p className="atlas-gh-detail-body">{detail.body || "Aucune description."}</p>
            <div className="atlas-gh-sha">Révision <code>{detail.resource.headSha.slice(0, 12)}</code></div>
            <div className="atlas-gh-files-head"><strong>Fichiers modifiés</strong>
              <span>{detail.files.length}{detail.filesTruncated ? "+" : ""} ·
                <b className="atlas-gh-plus"> +{detail.files.reduce((sum, file) => sum + file.additions, 0)}</b>
                <b className="atlas-gh-minus"> −{detail.files.reduce((sum, file) => sum + file.deletions, 0)}</b></span>
            </div>
            <div className="atlas-gh-code-explorer">
              <div className="atlas-gh-file-browser">
                <div className="atlas-gh-browser-heading">
                  <strong>Explorateur de fichiers</strong>
                  <span>{detail.files.length} fichier{detail.files.length > 1 ? "s" : ""}</span>
                </div>
                <div className="atlas-gh-files" role="group" aria-label="Fichiers modifiés">
                  {detail.files.slice(0, visibleFileCount).map((file) => (
                    <div key={file.path} className="atlas-gh-diff-file">
                      <button type="button" className={"atlas-gh-file" + (expandedFile === file.path ? " is-active" : "")}
                        onClick={() => setExpandedFile(expandedFile === file.path ? null : file.path)}
                        aria-expanded={expandedFile === file.path} aria-pressed={expandedFile === file.path}
                        aria-label={"Afficher les modifications de " + file.path}
                        title={file.path}>
                        <span className="atlas-gh-file-icon"><Icon name="layers"/></span>
                        <span className="atlas-gh-file-name">{file.path}</span>
                        <small className="atlas-gh-plus">+{file.additions}</small>
                        <small className="atlas-gh-minus">−{file.deletions}</small>
                        <Icon name="chevron-right"/>
                      </button>
                    </div>
                  ))}
                </div>
                {detail.files.length > visibleFileCount && <button type="button" className="atlas-gh-show-more"
                  onClick={() => setVisibleFileCount((count) => count + 35)}>
                  Afficher 35 fichiers supplémentaires ({detail.files.length - visibleFileCount} restants)
                </button>}
              </div>
              <div className="atlas-gh-code-pane" aria-label="Diff du fichier sélectionné">
                {detail.files.filter((file) => file.path === expandedFile).map((file) => (
                  <div key={file.path} className="atlas-gh-code-selection">
                    <div className="atlas-gh-code-heading">
                      <div><span className="atlas-gh-code-overline">MODIFICATIONS · LECTURE SEULE</span>
                        <strong title={file.path}>{file.path}</strong>
                      </div>
                      <span className="atlas-gh-code-counts">
                        <b className="atlas-gh-plus">+{file.additions}</b>
                        <b className="atlas-gh-minus">−{file.deletions}</b>
                      </span>
                    </div>
                    <div className="atlas-gh-diff">
                      {file.patch ? <pre aria-label={"Diff de " + file.path}>{file.patch.split("\n").map((line, index) => <span key={index}
                        className={line.startsWith("+") && !line.startsWith("+++") ? "is-add" : line.startsWith("-") && !line.startsWith("---") ? "is-remove" : line.startsWith("@@") ? "is-hunk" : ""}>{line}{"\n"}</span>)}</pre> :
                        <p>Aucun extrait de diff disponible (fichier binaire, volumineux ou non transmis par GitHub).</p>}
                    </div>
                  </div>
                ))}
                {!expandedFile && <div className="atlas-gh-code-empty">
                  <Icon name="layers"/>
                  <strong>Choisissez un fichier</strong>
                  <p>Sélectionnez un fichier à gauche pour consulter ses modifications, ligne par ligne.</p>
                </div>}
              </div>
            </div>
            {detail.filesTruncated && <p className="atlas-gh-truncated">Liste de fichiers partielle.</p>}
            <a className="atlas-gh-primary-action" href={detail.htmlUrl} target="_blank" rel="noopener noreferrer">
              Voir la PR sur GitHub <Icon name="arrow-up-right"/></a>
          </> : <div className="atlas-gh-detail-empty">
            <Icon name="activity"/><p>Sélectionnez une Pull Request pour lire sa description, ses fichiers et ses vrais diffs.</p>
          </div>}
        </section>
      </aside>}
    </div>}

    {section === "settings" && <section className="atlas-gh-panel atlas-gh-settings">
      <div className="atlas-gh-section-heading"><div><h2>Connexions & autorisations</h2>
        <p>Chaque installation reste liée au workspace {workspace.name}.</p></div></div>
      <div className="atlas-gh-permissions"><div><strong>Workspace</strong><span>{workspace.name}</span></div>
        <div><strong>Votre rôle</strong><span>{workspace.role === "owner" ? "Propriétaire" : workspace.role === "admin" ? "Admin" : "Membre"}</span></div>
        <div><strong>Accès</strong><span>Dépôts sélectionnés ou tous les dépôts autorisés par GitHub</span></div>
      </div>
      <div className="atlas-gh-install-list">{installations.length > 0 ? installations.map((item) =>
        <div key={item.installationId}><strong>Installation #{item.installationId}</strong>
          <span>{verified(item) ? (item.repositorySelection === "all" ? "Tous les dépôts autorisés" : "Dépôts sélectionnés vérifiés") : "Vérification incomplète"}</span></div>
      ) : <p>Aucune installation enregistrée.</p>}</div>
      {configured && canInstall ? <form method="post" action="/api/apps/github/connect/start">
        <input type="hidden" name="workspaceId" value={workspace.id}/>
        <button className="atlas-gh-primary-action" type="submit"><Icon name="link"/> Installer ou réautoriser GitHub</button>
        <p>La sélection des dépôts et l’autorisation passent par GitHub.</p>
      </form> : <p className="atlas-gh-notice">{!configured ? "La configuration serveur de la GitHub App est requise." :
        "Seuls les propriétaires et admins peuvent installer la GitHub App."}</p>}
    </section>}
        <p className="atlas-gh-footnote">Lecture des données GitHub à la demande, dans les limites d'accès de chaque installation.</p>
      </div>
    </div>
  </>;
}
