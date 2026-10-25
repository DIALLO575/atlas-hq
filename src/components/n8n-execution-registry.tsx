"use client";

import { useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/icon";

type Execution = {
  id: string; workflowId: string; missionId: string | null; workflowName: string | null;
  status: "unknown" | "new" | "running" | "waiting" | "success" | "error" | "canceled";
  startedAt: string | null; stoppedAt: string | null; lastSeenAt: string | null;
};
type Response = {
  source: "atlas-registry"; workspaceId: string; missionId: null;
  executionCountShown: number; executionListTruncated: boolean;
  providerConnected: false; liveSyncEnabled: false; canStartWorkflow: false;
  executions: Execution[];
};
const statuses: Record<Execution["status"], string> = {
  unknown:"Non vérifié",new:"Créé",running:"En cours",waiting:"En attente",
  success:"Terminé",error:"Erreur",canceled:"Annulé",
};
function formatDate(value: string | null) {
  if (!value) return "Date non enregistrée";
  const d=new Date(value);
  return Number.isNaN(d.getTime()) ? "Date non enregistrée" :
    new Intl.DateTimeFormat("fr", { dateStyle: "medium", timeStyle: "short" }).format(d);
}
export function N8nExecutionRegistry({ workspaceId }: { workspaceId: string }) {
  const [snapshot,setSnapshot]=useState<{workspaceId:string;value:Response}|null>(null);
  const [loading,setLoading]=useState(false);
  const [issue,setIssue]=useState<{workspaceId:string;message:string}|null>(null);
  const [query,setQuery]=useState("");
  const [status,setStatus]=useState("all");
  const [refresh,setRefresh]=useState(0);
  useEffect(()=>{
    const controller=new AbortController();
    void Promise.resolve().then(async()=>{
      if(controller.signal.aborted)return;
      setLoading(Boolean(workspaceId));
      setSnapshot(null);
      setIssue(null);
      if(!workspaceId){setLoading(false);return;}
      try {
        const response=await fetch("/api/apps/n8n/coordination?workspaceId="+encodeURIComponent(workspaceId),{
          credentials:"same-origin",cache:"no-store",signal:controller.signal,
        });
        if(!response.ok)throw new Error("REGISTRY_UNAVAILABLE");
        const view=await response.json() as Response;
        if(view.source!=="atlas-registry"||view.workspaceId!==workspaceId||
          view.providerConnected!==false||view.liveSyncEnabled!==false||
          view.canStartWorkflow!==false||!Array.isArray(view.executions))
          throw new Error("REGISTRY_INVALID");
        if(!controller.signal.aborted)setSnapshot({workspaceId,value:view});
      }catch{
        if(!controller.signal.aborted)setIssue({workspaceId,message:"Historique n8n indisponible pour ce workspace."});
      }finally{if(!controller.signal.aborted)setLoading(false);}
    });
    return ()=>controller.abort();
  },[workspaceId,refresh]);
  const data=snapshot?.workspaceId===workspaceId?snapshot.value:null;
  const error=issue?.workspaceId===workspaceId?issue.message:null;
  const executions=useMemo(()=>data?.executions??[],[data]);
  const filtered=useMemo(()=>executions.filter(item=>
    (status==="all"||item.status===status)&&
    (item.workflowName??item.workflowId).toLocaleLowerCase("fr").includes(query.toLocaleLowerCase("fr").trim())
  ),[executions,query,status]);
  return <section className="n8n-panel n8n-data-panel" aria-label="Exécutions n8n enregistrées">
    <div className="n8n-section-heading">
      <div><p className="n8n-eyebrow">OBSERVABILITÉ / REGISTRE ATLAS</p><h2>Historique des exécutions</h2>
        <p>Statuts déjà enregistrés, sans interrogation directe du moteur n8n.</p></div>
      <span className="n8n-small-pill">Lecture seule</span>
    </div>
    <div className="n8n-list-controls">
      <label className="n8n-search"><Icon name="search" /><span className="sr-only">Rechercher une exécution</span>
        <input type="search" placeholder="Rechercher un workflow..." value={query}
          onChange={event=>setQuery(event.target.value)} maxLength={100} /></label>
      <label className="n8n-filter"><span>Statut</span>
        <select value={status} onChange={event=>setStatus(event.target.value)}>
          <option value="all">Tous les statuts</option>
          {Object.entries(statuses).map(([value,label])=><option key={value} value={value}>{label}</option>)}
        </select></label>
      <button type="button" className="n8n-outline-button" disabled={!workspaceId||loading}
        onClick={()=>setRefresh(v=>v+1)}><Icon name="rotate-ccw" /> Actualiser</button>
    </div>
    <p className="n8n-results" role="status">{data?
      filtered.length+" affichée"+(filtered.length>1?"s":"")+" sur "+executions.length+
      " entrée"+(executions.length>1?"s":"")+" chargée"+(executions.length>1?"s":""):
      loading?"Chargement des exécutions…":"Registre non chargé"}</p>
    {!workspaceId&&<div className="n8n-empty-state"><h3>Aucun workspace disponible</h3></div>}
    {error&&<p role="alert" className="n8n-warning">{error}</p>}
    {data&&executions.length===0&&<div className="n8n-empty-state">
      <span className="n8n-empty-icon"><Icon name="activity" /></span>
      <h3>Aucune exécution enregistrée</h3>
      <p>Le registre Atlas n’a pas encore d’historique. Cela n’indique pas l’état du serveur n8n.</p>
    </div>}
    {data&&executions.length>0&&filtered.length===0&&<div className="n8n-empty-state">
      <h3>Aucun résultat pour ce filtre</h3><p>Modifiez la recherche ou le statut pour afficher d’autres entrées.</p>
      <button type="button" className="n8n-outline-button" onClick={()=>{setQuery("");setStatus("all");}}>Effacer les filtres</button>
    </div>}
    {filtered.length>0&&<div className="n8n-table-scroll"><table className="n8n-table">
      <thead><tr><th>Workflow</th><th>Statut enregistré</th><th>Mission</th><th>Date d’observation</th></tr></thead>
      <tbody>{filtered.map(item=><tr key={item.id}>
        <td><strong>{item.workflowName??"Workflow hors de l’extrait"}</strong><small>Réf. Atlas : {item.id.slice(0,8)}…</small></td>
        <td><span className="n8n-status-tag" data-status={item.status}>{statuses[item.status]}</span></td>
        <td>{item.missionId?<span>Mission liée</span>:<span>Autonome</span>}</td>
        <td>{formatDate(item.lastSeenAt??item.startedAt)}</td>
      </tr>)}</tbody>
    </table></div>}
    {data?.executionListTruncated&&<p className="n8n-note">Extrait limité aux 50 entrées les plus récentes. Ce chiffre n’est pas le total des exécutions n8n.</p>}
    <p className="n8n-panel-footnote">La réussite ou l’échec affichés sont les derniers états enregistrés par Atlas ;
      aucune vérification n8n live et aucun redémarrage ne sont possibles ici.</p>
  </section>;
}
