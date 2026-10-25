"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import styles from "./n8n-coordination-panel.module.css";
import type { N8nCoordinationView } from "../../packages/engines/n8n/src/coordination.mjs";

type Scope = "chief" | "agents" | "missions";
type Props = { workspaceId: string; scope: Scope; missionId?: string };
const statusLabels: Record<string,string> = {
  unknown:"Non vérifié",new:"Créée",running:"En cours",waiting:"En attente",
  success:"Terminée",error:"En erreur",canceled:"Annulée",
};
function dateText(iso:string|null){
  if(!iso)return "Date non observée";
  const date=new Date(iso);
  return Number.isNaN(date.getTime())?"Date non vérifiée":
    new Intl.DateTimeFormat("fr",{dateStyle:"medium"}).format(date);
}
export function N8nCoordinationPanel({workspaceId,scope,missionId}:Props){
  const [view,setView]=useState<{key:string;data:N8nCoordinationView}|null>(null);
  const [issue,setIssue]=useState<{key:string;message:string}|null>(null);
  const [loading,setLoading]=useState(false);
  const [refresh,setRefresh]=useState(0);
  const key=workspaceId+"|"+(missionId??"");
  useEffect(()=>{
    const controller=new AbortController();
    void Promise.resolve().then(async()=>{
      if(controller.signal.aborted)return;
      setLoading(Boolean(workspaceId));
      setView(null);
      setIssue(null);
      if(!workspaceId){setLoading(false);return;}
      try{
        const params=new URLSearchParams({workspaceId});
        if(missionId)params.set("missionId",missionId);
        const response=await fetch("/api/apps/n8n/coordination?"+params.toString(),{
          cache:"no-store",credentials:"same-origin",signal:controller.signal,
        });
        if(!response.ok)throw new Error("REGISTRY_UNAVAILABLE");
        const data=await response.json() as N8nCoordinationView;
        if(data.source!=="atlas-registry"||data.workspaceId!==workspaceId||
          data.missionId!==(missionId??null)||data.providerConnected!==false||
          data.canStartWorkflow!==false)throw new Error("UNTRUSTED_RESPONSE");
        if(!controller.signal.aborted)setView({key,data});
      }catch{
        if(!controller.signal.aborted)setIssue({
          key,message:"Impossible de consulter les métadonnées n8n pour ce workspace.",
        });
      }finally{
        if(!controller.signal.aborted)setLoading(false);
      }
    });
    return ()=>controller.abort();
  },[workspaceId,missionId,refresh,key]);

  const data=view?.key===key?view.data:null;
  const failure=issue?.key===key?issue.message:null;
  const heading=scope==="chief"?"Automatisations dans Chief":
    scope==="missions"?"Exécutions liées aux missions":"Automatisations et agents";
  const explanation=scope==="agents"
    ? "Un workflow n8n est une automatisation, pas un agent IA certifié. Les liaisons Agent ↔ Moteur ne sont pas encore vérifiées."
    : scope==="missions"
    ? "Historique des exécutions enregistrées dans Atlas. Une mission est facultative pour une automatisation n8n."
    : "Vue factuelle des workflows et exécutions référencés dans Atlas ; Chief ne lance aucune opération.";

  return <section className={styles.panel} aria-label={"n8n : "+heading}>
    <div className={styles.header}>
      <div><span className={styles.eyebrow}>N8N · REGISTRE ATLAS · LECTURE SEULE</span>
        <h2>{heading}</h2></div>
      <div className={styles.actions}>
        <button type="button" onClick={()=>setRefresh(x=>x+1)} disabled={!workspaceId||loading}
          aria-label="Actualiser le registre n8n">{loading?"Lecture…":"Actualiser"}</button>
        <Link href={"/apps/n8n?workspaceId="+encodeURIComponent(workspaceId)}>
          Centre n8n</Link>
      </div>
    </div>
    <p className={styles.intro}>{explanation}</p>
    {scope==="agents"&&<p className={styles.notice}>Agent n8n certifié : <strong>non vérifié</strong>.
      Aucune liaison IA ni identité d’agent n’est affirmée par ce registre.</p>}
    {scope==="chief"&&<p className={styles.notice}>Chief reste un assistant de briefing guidé.
      Aucun modèle IA ni outil d’exécution n’est connecté ici.</p>}
    {missionId&&<p className={styles.notice}>Filtre mission actif.
      <Link href={"/missions?workspaceId="+encodeURIComponent(workspaceId)}> Voir toutes les missions</Link></p>}
    {!workspaceId&&<p>Aucun workspace sélectionné.</p>}
    {loading&&<p role="status">Lecture du registre autorisé…</p>}
    {failure&&<p role="alert" className={styles.error}>{failure}</p>}
    {data&&<>
      <div className={styles.metrics} aria-label="Nombre d’entrées consultées dans le registre">
        <div><strong>{data.workflowCountShown}{data.workflowListTruncated?"+":""}</strong>
          <span>Workflows référencés (extrait)</span></div>
        <div><strong>{data.executionCountShown}{data.executionListTruncated?"+":""}</strong>
          <span>{missionId?"Exécutions de cette mission":"Exécutions enregistrées (extrait)"}</span></div>
        <div><strong>Non connecté</strong><span>Fournisseur n8n : accès live désactivé</span></div>
      </div>
      {data.workflows.length===0&&<p className={styles.empty}>Aucun workflow dans l’extrait du registre Atlas.
        Cela ne prouve pas l’absence de workflows sur le serveur n8n.</p>}
      {data.workflows.length>0&&<div className={styles.listSection}>
        <h3>Workflows enregistrés</h3><ul className={styles.list}>
          {data.workflows.slice(0,5).map(w=><li key={w.id}>
            <strong>{w.name}</strong><span>{w.syncState==="observed"?"Observé précédemment":
              w.syncState==="missing"?"Absent lors de la dernière synchronisation":"Non vérifié"}
              {" · "+dateText(w.lastSeenAt)}</span>
          </li>)}
        </ul>{data.workflows.length>5&&<p className={styles.note}>5 workflows affichés ici ; consultez Mes Apps pour davantage de détails.</p>}
      </div>}
      <div className={styles.listSection}><h3>Dernières exécutions enregistrées</h3>
        {data.executions.length===0?<p className={styles.empty}>Aucune exécution enregistrée{missionId?" pour cette mission":""}.
          Aucun démarrage automatique n’est possible depuis cet écran.</p>:
        <ul className={styles.list}>{data.executions.slice(0,8).map(e=><li key={e.id}>
          <strong>{e.workflowName??"Workflow référencé hors de l’extrait"}</strong>
          <span>{statusLabels[e.status]??"Non vérifié"} · {dateText(e.startedAt??e.lastSeenAt)}
            {e.missionId?" · Mission liée":" · Automatisation autonome"}</span>
        </li>)}</ul>}
      </div>
      {(data.workflowListTruncated||data.executionListTruncated)&&<p className={styles.note}>
        Résultat partiel limité aux 50 entrées les plus récentes par type. Ce ne sont pas des statistiques globales.</p>}
    </>}
    <p className={styles.footer}>Source : métadonnées Supabase Atlas, autorisées par workspace.
      Pas de synchronisation live n8n, de liaison d’agent certifiée ou d’exécution possible.</p>
  </section>;
}
