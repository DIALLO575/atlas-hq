"use client";

import { useEffect, useState } from "react";

type Workflow = {
  id: string;
  instanceId: string;
  remoteId: string;
  name: string;
  remoteActive: boolean | null;
  syncState: "unverified" | "observed" | "missing";
  remoteUpdatedAt: string | null;
  lastSeenAt: string | null;
};
type RegistryResponse = {
  source: "atlas-registry";
  readOnly: true;
  providerConnected: false;
  liveSyncEnabled: false;
  workflows: Workflow[];
};
export function N8nWorkflowRegistry({ workspaceId }: { workspaceId: string }) {
  const [view, setView] = useState<{ workspaceId: string; data: RegistryResponse } | null>(null);
  const [issue, setIssue] = useState<{ workspaceId: string; message: string } | null>(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    const abort = new AbortController();
    void Promise.resolve().then(async () => {
      if (abort.signal.aborted) return;
      setLoading(Boolean(workspaceId));
      setView(null);
      setIssue(null);
      if (!workspaceId) return;
      try {
        const response = await fetch("/api/apps/n8n/workflows?workspaceId=" + encodeURIComponent(workspaceId), {
          credentials: "same-origin", cache: "no-store", signal: abort.signal,
        });
        if (!response.ok) throw new Error("N8N_REGISTRY_UNAVAILABLE");
        const data = await response.json() as RegistryResponse;
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
  }, [workspaceId]);
  const data = view?.workspaceId === workspaceId ? view.data : null;
  const message = issue?.workspaceId === workspaceId ? issue.message : null;
  return <section className="n8n-panel" aria-label="Workflows n8n enregistrés">
    <div className="n8n-section-heading"><div><p className="n8n-eyebrow">INVENTAIRE ATLAS</p>
      <h2>Workflows référencés</h2></div>
      <span>Lecture seule</span></div>
    <p>Ce registre présente uniquement les métadonnées déjà stockées dans Atlas.
      Aucune synchronisation avec un serveur n8n réel n’est active.</p>
    {!workspaceId && <p>Aucun workspace disponible.</p>}
    {loading && <p role="status">Chargement du registre…</p>}
    {message && <p className="n8n-warning" role="alert">{message}</p>}
    {data && data.workflows.length === 0 &&
      <p>Aucun workflow n8n enregistré. Une liste vide ne signifie pas que votre instance n8n ne contient aucun workflow.</p>}
    {data && data.workflows.length > 0 && <ul className="n8n-instances">{data.workflows.map(item =>
      <li key={item.id}><div><strong>{item.name}</strong>
        <small>Workflow {item.remoteId} · {item.syncState === "observed" ? "Observé précédemment" :
          item.syncState === "missing" ? "Absent lors de la dernière synchronisation" : "Non vérifié"}
          {item.lastSeenAt ? " · Dernière observation : " + new Date(item.lastSeenAt).toLocaleDateString("fr") : ""}</small></div>
        <span>{item.remoteActive === null ? "Statut distant inconnu" :
          item.remoteActive ? "Actif chez n8n lors de l’observation" : "Inactif chez n8n lors de l’observation"}</span>
      </li>)}</ul>}
    {data && data.workflows.length >= 50 &&
      <p role="status">Affichage limité aux 50 dernières entrées du registre Atlas.</p>}
  </section>;
}
