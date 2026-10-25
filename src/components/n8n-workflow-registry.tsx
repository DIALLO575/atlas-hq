"use client";

import { useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/icon";

type Workflow = {
  id: string; instanceId: string; remoteId: string; name: string;
  remoteActive: boolean | null;
  syncState: "unverified" | "observed" | "missing";
  remoteUpdatedAt: string | null; lastSeenAt: string | null;
};
type RegistryResponse = {
  source: "atlas-registry"; readOnly: true; providerConnected: false;
  liveSyncEnabled: false; workflows: Workflow[];
};
function dateLabel(value: string | null) {
  if (!value) return "Jamais observé";
  const date=new Date(value);
  return Number.isNaN(date.getTime()) ? "Date inconnue" :
    new Intl.DateTimeFormat("fr", { dateStyle: "medium" }).format(date);
}
const states = {
  all: "Tous les états",
  observed: "Observé précédemment",
  unverified: "Non vérifié",
  missing: "Absent à la dernière synchronisation",
} as const;

export function N8nWorkflowRegistry({ workspaceId }: { workspaceId: string }) {
  const [view, setView] = useState<{ workspaceId: string; data: RegistryResponse } | null>(null);
  const [issue, setIssue] = useState<{ workspaceId: string; message: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [refresh,setRefresh] = useState(0);
  const [search,setSearch] = useState("");
  const [filter,setFilter] = useState<keyof typeof states>("all");
  useEffect(() => {
    const abort = new AbortController();
    void Promise.resolve().then(async () => {
      if (abort.signal.aborted) return;
      setLoading(Boolean(workspaceId));
      setView(null);
      setIssue(null);
      if (!workspaceId) {setLoading(false);return;}
      try {
        const response = await fetch("/api/apps/n8n/workflows?workspaceId=" + encodeURIComponent(workspaceId), {
          credentials: "same-origin", cache: "no-store", signal: abort.signal,
        });
        if (!response.ok) throw new Error("N8N_REGISTRY_UNAVAILABLE");
        const data = await response.json() as RegistryResponse;
        if(data.source!=="atlas-registry"||data.readOnly!==true||
          data.providerConnected!==false||data.liveSyncEnabled!==false||
          !Array.isArray(data.workflows))throw new Error("N8N_REGISTRY_UNTRUSTED");
        if (abort.signal.aborted) return;
        setView({ workspaceId, data });
      } catch {
        if (!abort.signal.aborted) setIssue({
          workspaceId, message: "Le registre des workflows n8n ne peut pas être consulté.",
        });
      } finally {
        if (!abort.signal.aborted) setLoading(false);
      }
    });
    return () => abort.abort();
  }, [workspaceId,refresh]);
  const data = view?.workspaceId === workspaceId ? view.data : null;
  const message = issue?.workspaceId === workspaceId ? issue.message : null;
  const filtered=useMemo(()=> (data?.workflows??[]).filter(item =>
    (filter==="all"||item.syncState===filter)&&
    (item.name+" "+item.remoteId).toLocaleLowerCase("fr").includes(search.trim().toLocaleLowerCase("fr"))
  ),[data,filter,search]);

  return <section className="n8n-panel n8n-data-panel" aria-label="Workflows n8n enregistrés">
    <div className="n8n-section-heading"><div><p className="n8n-eyebrow">INVENTAIRE / REGISTRE ATLAS</p>
      <h2>Bibliothèque de workflows</h2>
      <p>Recherchez les références et états observés, sans ouvrir de connexion fournisseur.</p></div>
      <span className="n8n-small-pill">Lecture seule</span></div>
    <div className="n8n-list-controls">
      <label className="n8n-search"><Icon name="search" /><span className="sr-only">Rechercher un workflow</span>
        <input type="search" placeholder="Rechercher un workflow ou une référence..." value={search}
          maxLength={100} onChange={event=>setSearch(event.target.value)} /></label>
      <label className="n8n-filter"><span>État</span>
        <select value={filter} onChange={event=>setFilter(event.target.value as keyof typeof states)}>
          {Object.entries(states).map(([value,name])=><option key={value} value={value}>{name}</option>)}
        </select></label>
      <button type="button" className="n8n-outline-button" disabled={!workspaceId||loading}
        onClick={()=>setRefresh(n=>n+1)}><Icon name="rotate-ccw" /> Actualiser</button>
    </div>
    <p className="n8n-results" role="status">{data ?
      filtered.length+" affiché"+(filtered.length>1?"s":"")+" sur "+data.workflows.length+
      " entrée"+(data.workflows.length>1?"s":"")+" chargée"+(data.workflows.length>1?"s":""):
      loading?"Chargement du registre…":"Registre non chargé"}</p>
    {!workspaceId && <p>Aucun workspace disponible.</p>}
    {message && <p className="n8n-warning" role="alert">{message}</p>}
    {data && data.workflows.length === 0 && <div className="n8n-empty-state">
      <span className="n8n-empty-icon"><Icon name="workflow" /></span>
      <h3>Aucun workflow référencé</h3>
      <p>Aucun workflow n8n enregistré dans Atlas. Cela ne signifie pas que votre instance distante est vide.</p>
    </div>}
    {data && data.workflows.length > 0 && filtered.length === 0 && <div className="n8n-empty-state">
      <h3>Aucun résultat trouvé</h3>
      <p>Essayez un autre mot-clé ou état de synchronisation.</p>
      <button type="button" className="n8n-outline-button" onClick={()=>{setSearch("");setFilter("all");}}>Effacer les filtres</button>
    </div>}
    {filtered.length > 0 && <div className="n8n-table-scroll"><table className="n8n-table">
      <thead><tr><th>Workflow</th><th>Dernière observation</th><th>Synchronisation</th><th>État distant observé</th></tr></thead>
      <tbody>{filtered.map(item => <tr key={item.id}>
        <td><strong>{item.name}</strong><small>Réf. n8n : {item.remoteId}</small></td>
        <td>{dateLabel(item.lastSeenAt)}</td>
        <td><span className="n8n-status-tag" data-status={item.syncState}>
          {item.syncState==="observed"?"Observé":item.syncState==="missing"?"Manquant":"Non vérifié"}</span></td>
        <td>{item.remoteActive===null?"Inconnu":item.remoteActive?"Actif (ancienne observation)":"Inactif (ancienne observation)"}</td>
      </tr>)}</tbody>
    </table></div>}
    {data && data.workflows.length >= 50 &&
      <p role="status" className="n8n-note">Affichage limité aux 50 dernières entrées du registre Atlas.</p>}
    <p className="n8n-panel-footnote">Aucune synchronisation n8n live n’est active. Les états distants sont des
      observations historiques, pas une autorisation de publication ou d’exécution.</p>
  </section>;
}
