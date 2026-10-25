"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/icon";

type Run={
  id:number; name:string; title:string; status:string; conclusion:string|null;
  attempt:number; branch:string; sha:string|null;event:string;createdAt:string|null;
  updatedAt:string|null;url:string;
};
type Job={
  id:number;name:string;status:string;conclusion:string|null;
  startedAt:string|null;completedAt:string|null;url:string;
  failedSteps:Array<{number:number|null;name:string;conclusion:string|null}>;
};
type RunList={repository:{id:number;fullName:string};runs:Run[];truncated:boolean};
type JobList={run:Run;jobs:Job[];truncated:boolean};
const errors:Record<string,string>={
  AUTH_REQUIRED:"Votre session Atlas a expiré : reconnectez-vous.",
  WORKSPACE_FORBIDDEN:"Vous n'avez pas accès à ce workspace.",
  GITHUB_NOT_AUTHORIZED:"Ce dépôt n'est pas autorisé pour votre installation GitHub.",
  PERMISSION_DENIED:"La GitHub App doit recevoir « Actions: Read », puis être réapprouvée par le propriétaire de l'installation.",
  NOT_FOUND_OR_HIDDEN:"Cette exécution est introuvable ou inaccessible.",
  GITHUB_NOT_CONFIGURED:"La connexion GitHub doit être configurée côté serveur.",
  RATE_LIMITED:"Limite GitHub atteinte. Réessayez plus tard.",
};

async function actionsRequest<T>(params:Record<string,string>,signal:AbortSignal):Promise<T> {
  const response=await fetch("/api/apps/github/actions?"+new URLSearchParams(params),{
    method:"GET",credentials:"same-origin",cache:"no-store",signal,
  });
  const data=await response.json();
  if (!response.ok) throw new Error(errors[String(data?.error)]??
    "Impossible de consulter GitHub Actions pour le moment.");
  return data as T;
}
const badge=(run:Pick<Run,"status"|"conclusion">)=>{
  if(run.status!=="completed")return {name:"En cours",kind:"running"};
  if(run.conclusion==="success")return {name:"Réussi",kind:"success"};
  if(run.conclusion==="failure"||run.conclusion==="timed_out")return {name:"Échec",kind:"failure"};
  if(run.conclusion==="cancelled")return {name:"Annulé",kind:"neutral"};
  return {name:run.conclusion??"Terminée",kind:"neutral"};
};
const when=(raw:string|null)=>{
  if(!raw)return "Date indisponible";
  const date=new Date(raw);
  return Number.isFinite(date.getTime()) ?
    new Intl.DateTimeFormat("fr",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"}).format(date):
    "Date indisponible";
};

export function GitHubActionsControlCenter({workspaceId,installationId,repositories,ready}:{
  workspaceId:string;installationId:number|null;
  repositories:Array<{id:number;fullName:string}>;
  ready:boolean;
}) {
  const [repositoryId,setRepositoryId]=useState<number|null>(null);
  const [runs,setRuns]=useState<Run[]>([]);
  const [truncated,setTruncated]=useState(false);
  const [selectedRunId,setSelectedRunId]=useState<number|null>(null);
  const [jobs,setJobs]=useState<Job[]>([]);
  const [jobsTruncated,setJobsTruncated]=useState(false);
  const [filter,setFilter]=useState<"all"|"failure"|"success">("all");
  const [loading,setLoading]=useState<"runs"|"jobs"|null>(null);
  const [error,setError]=useState<string|null>(null);
  const runsController=useRef<AbortController|null>(null);
  const jobsController=useRef<AbortController|null>(null);
  const activeRepo=repositoryId!==null && repositories.some(r=>r.id===repositoryId)
    ? repositoryId : repositories[0]?.id??null;
  const selectedRepo=repositories.find(r=>r.id===activeRepo);
  const selectedRun=runs.find(r=>r.id===selectedRunId);
  const visible=useMemo(()=>runs.filter(run=>
    filter==="all" || (filter==="failure"
      ? ["failure","timed_out","cancelled"].includes(run.conclusion??"")
      : run.conclusion==="success")), [runs,filter]);
  const summary=useMemo(()=>({
    failures:runs.filter(r=>["failure","timed_out"].includes(r.conclusion??"")).length,
    success:runs.filter(r=>r.conclusion==="success").length,
    active:runs.filter(r=>r.status!=="completed").length,
  }),[runs]);

  async function loadRuns(repo:number,controller:AbortController) {
    jobsController.current?.abort();
    setError(null);setRuns([]);setJobs([]);setSelectedRunId(null);
    setTruncated(false);setLoading("runs");
    try{
      const data=await actionsRequest<RunList>({
        workspaceId,installationId:String(installationId),repositoryId:String(repo),view:"runs",
      },controller.signal);
      if(controller.signal.aborted)return;
      if(data.repository.id!==repo || !Array.isArray(data.runs))throw new Error("Réponse GitHub inattendue.");
      setRuns(data.runs);setTruncated(data.truncated);
    }catch(e) {
      if(!controller.signal.aborted)setError(e instanceof Error?e.message:"GitHub Actions indisponible.");
    }finally {
      if(!controller.signal.aborted)setLoading(null);
    }
  }
  useEffect(()=>{
    if(!ready || installationId===null || activeRepo===null)return;
    const controller=new AbortController();
    runsController.current=controller;
    const frame=window.requestAnimationFrame(()=>{void loadRuns(activeRepo,controller);});
    return ()=>{window.cancelAnimationFrame(frame);controller.abort();jobsController.current?.abort();};
    // Refresh only when workspace, installation or selected repository changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[workspaceId,installationId,activeRepo,ready]);

  async function showJobs(run:Run) {
    if(!activeRepo || !installationId)return;
    jobsController.current?.abort();
    const controller=new AbortController();
    jobsController.current=controller;
    setSelectedRunId(run.id);setJobs([]);setJobsTruncated(false);setError(null);setLoading("jobs");
    try{
      const data=await actionsRequest<JobList>({
        workspaceId,installationId:String(installationId),
        repositoryId:String(activeRepo),view:"jobs",runId:String(run.id),
      },controller.signal);
      if(controller.signal.aborted)return;
      if(data.run.id!==run.id || !Array.isArray(data.jobs))throw new Error("Réponse GitHub inattendue.");
      setJobs(data.jobs);setJobsTruncated(data.truncated);
    }catch(e){
      if(!controller.signal.aborted)setError(e instanceof Error?e.message:"Impossible de lire les jobs.");
    }finally{
      if(!controller.signal.aborted)setLoading(null);
    }
  }
  function refresh() {
    if(!activeRepo || !ready || !installationId)return;
    runsController.current?.abort();
    const controller=new AbortController();
    runsController.current=controller;
    void loadRuns(activeRepo,controller);
  }

  return <section className="atlas-gh-actions" aria-label="GitHub Actions Control Center">
    <header className="atlas-gh-actions-hero">
      <div><span className="atlas-gh-actions-overline"><Icon name="activity"/> GITHUB ACTIONS / CI-CD</span>
        <h2>Vos builds, sans zone d&apos;ombre<span>.</span></h2>
        <p>Suivez les exécutions, identifiez les jobs en échec et ouvrez leurs diagnostics détaillés.</p>
      </div>
      <span className="atlas-gh-actions-readonly"><Icon name="layers"/> Lecture sécurisée</span>
    </header>
    <div className="atlas-gh-actions-toolbar">
      <label>Dépôt
        <select value={activeRepo??""} disabled={loading!==null || !ready || !repositories.length}
          onChange={event=>{jobsController.current?.abort();runsController.current?.abort();setRepositoryId(Number(event.target.value));}}>
          {repositories.map(repo=><option value={repo.id} key={repo.id}>{repo.fullName}</option>)}
        </select>
      </label>
      <button type="button" onClick={refresh} disabled={!activeRepo || loading!==null}>
        <Icon name="rotate-ccw"/> Actualiser
      </button>
    </div>
    {!ready && <p className="atlas-gh-actions-alert" role="status">Connectez une installation GitHub vérifiée pour voir les workflows.</p>}
    {ready && !repositories.length && <p className="atlas-gh-actions-alert" role="status">Aucun dépôt autorisé disponible. Sélectionnez-en un dans GitHub.</p>}
    {error && <div className="atlas-gh-actions-alert" role="alert">{error}
      <button type="button" onClick={refresh}>Réessayer</button></div>}
    {activeRepo!==null && ready && <>
      <div className="atlas-gh-actions-stats">
        <div><strong>{runs.length}</strong><span>Exécutions récentes</span></div>
        <div><strong>{summary.success}</strong><span>Réussies</span></div>
        <div><strong>{summary.failures}</strong><span>En échec</span></div>
        <div><strong>{summary.active}</strong><span>En cours</span></div>
      </div>
      <div className="atlas-gh-actions-content">
        <section className="atlas-gh-actions-feed" aria-label="Exécutions GitHub">
          <header><div><h3>Historique des workflows</h3>
            <p>{selectedRepo?.fullName??"Dépôt"} · 20 exécutions maximum</p></div>
            <div className="atlas-gh-actions-filters">
              {(["all","failure","success"] as const).map(value=><button key={value}
                type="button" aria-pressed={filter===value} onClick={()=>setFilter(value)}>
                {value==="all"?"Tous":value==="failure"?"Échecs":"Réussis"}
              </button>)}
            </div>
          </header>
          {loading==="runs" && <p className="atlas-gh-actions-message" role="status">Chargement des workflows…</p>}
          {loading!=="runs" && visible.length===0 && <p className="atlas-gh-actions-message">
            {runs.length===0?"Aucune exécution GitHub Actions pour ce dépôt.":"Aucune exécution dans ce filtre."}
          </p>}
          <div className="atlas-gh-actions-runs">
            {visible.map(run=><button type="button" key={run.id} onClick={()=>void showJobs(run)}
              className={"atlas-gh-actions-run "+(selectedRunId===run.id?"is-active":"")}
              aria-pressed={selectedRunId===run.id}>
              <span className={"atlas-gh-actions-indicator is-"+badge(run).kind}/>
              <span className="atlas-gh-actions-run-text"><strong>{run.name||run.title||"Workflow"}</strong>
                <small>{run.branch||"branche inconnue"} · {run.sha?.slice(0,7)||"SHA indisponible"} · {when(run.createdAt)}</small>
              </span>
              <span className={"atlas-gh-actions-status is-"+badge(run).kind}>{badge(run).name}</span>
              <Icon name="chevron-right"/>
            </button>)}
          </div>
          {truncated && <p className="atlas-gh-actions-message">Liste limitée aux 20 dernières exécutions. Voir GitHub pour l&apos;historique complet.</p>}
        </section>
        <aside className="atlas-gh-actions-inspector" aria-label="Diagnostic de workflow">
          <span className="atlas-gh-actions-overline">INSPECTEUR DE CI</span>
          {!selectedRun && <div className="atlas-gh-actions-placeholder">
            <span><Icon name="activity"/></span>
            <h3>Sélectionnez une exécution</h3>
            <p>Découvrez les jobs, leur état et les étapes responsables d&apos;un échec.</p>
          </div>}
          {selectedRun && <>
            <h3>{selectedRun.name||selectedRun.title||"Workflow"}</h3>
            <div className="atlas-gh-actions-meta">
              <span>{badge(selectedRun).name}</span><span>Tentative #{selectedRun.attempt}</span>
              <span>{selectedRun.event||"GitHub"}</span>
            </div>
            <a href={selectedRun.url} target="_blank" rel="noopener noreferrer"
              className="atlas-gh-actions-link">Ouvrir sur GitHub <Icon name="arrow-up-right"/></a>
            {loading==="jobs" && <p className="atlas-gh-actions-message" role="status">Analyse des jobs…</p>}
            {loading!=="jobs" && !jobs.length && <p className="atlas-gh-actions-message">Aucun job à afficher.</p>}
            <div className="atlas-gh-actions-job-list">
              {jobs.map(job=><article key={job.id} className="atlas-gh-actions-job">
                <div className="atlas-gh-actions-job-head">
                  <strong>{job.name||"Job"}</strong>
                  <span className={"atlas-gh-actions-status is-"+badge(job).kind}>{badge(job).name}</span>
                </div>
                {job.failedSteps.length>0 && <div className="atlas-gh-actions-failed-steps">
                  <span>Étapes à examiner</span>
                  {job.failedSteps.map((step,i)=><p key={step.number??i}>
                    <Icon name="activity"/> {step.name||"Étape en échec"}
                  </p>)}
                </div>}
                <a href={job.url} target="_blank" rel="noopener noreferrer">
                  Consulter les logs GitHub <Icon name="arrow-up-right"/>
                </a>
              </article>)}
            </div>
            {jobsTruncated && <p className="atlas-gh-actions-message">Liste de jobs partielle ; voir GitHub pour l&apos;ensemble.</p>}
          </>}
          <p className="atlas-gh-actions-safety">Lecture seule. Relancer un workflow nécessite une permission Actions: Write et un accord explicite, non activés ici.</p>
        </aside>
      </div>
    </>}
  </section>;
}
