"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { BrandLogo } from "@/components/brand-logo";
import { N8nWorkflowRegistry } from "@/components/n8n-workflow-registry";
import type { Workspace } from "@/lib/workspaces/contract";

type Instance = {
  id: string;
  label: string;
  transport: string;
  registryState: string;
  createdAt: string;
};
type Snapshot = {
  engine: "n8n";
  state: "not-configured" | "preconnection" | "configuration-error";
  serverConfiguration: "missing" | "ready-for-preconnection" | "invalid";
  instances: Instance[];
  connected: false;
  readOnlyApiEnabled: false;
  workflowInventory: "unavailable";
  capabilitiesTestedLive: 0;
  note: string;
};
type Props = { workspaces: Workspace[]; initialWorkspaceId: string; workspaceLoadFailed: boolean };
const errorMessages: Record<string, string> = {
  AUTH_REQUIRED: "Votre session a expiré. Reconnectez-vous à ATLAS.",
  WORKSPACE_FORBIDDEN: "Vous n’avez pas accès à ce workspace.",
  N8N_REGISTRY_UNAVAILABLE: "Le registre des instances n’est pas accessible.",
  ENGINE_REGISTRATION_FAILED: "Impossible d’enregistrer l’instance hors ligne.",
  ENGINE_WRITE_FORBIDDEN: "Seuls les propriétaires et administrateurs peuvent enregistrer une instance.",
};

export function N8nControlCenter({ workspaces, initialWorkspaceId, workspaceLoadFailed }: Props) {
  const [workspaceId, setWorkspaceId] = useState(initialWorkspaceId);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [issue, setIssue] = useState<string | null>(null);
  const [label, setLabel] = useState("n8n — automatisations");
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void Promise.resolve().then(async () => {
      if (controller.signal.aborted) return;
      setSnapshot(null);
      setIssue(null);
      if (!workspaceId) { setLoading(false); return; }
      setLoading(true);
      try {
        const response = await fetch("/api/apps/n8n/status?workspaceId=" + encodeURIComponent(workspaceId), {
          credentials: "same-origin", cache: "no-store", signal: controller.signal,
        });
        const data = await response.json() as Snapshot & { error?: string };
        if (!response.ok) throw new Error(data.error ?? "N8N_REGISTRY_UNAVAILABLE");
        if (!controller.signal.aborted) setSnapshot(data);
      } catch (error) {
        if (!controller.signal.aborted) {
          const code = error instanceof Error ? error.message : "N8N_REGISTRY_UNAVAILABLE";
          setIssue(errorMessages[code] ?? "Impossible de vérifier la préconnexion n8n.");
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    });
    return () => controller.abort();
  }, [workspaceId, refresh]);

  const workspace = workspaces.find(item => item.id === workspaceId);
  const mayRegister = workspace?.role === "owner" || workspace?.role === "admin";
  const instances = snapshot?.instances ?? [];
  const state = snapshot?.state ?? "not-configured";

  async function registerOffline(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!mayRegister || !workspaceId || !snapshot || instances.length || submitting) return;
    setSubmitting(true);
    setNotice(null);
    setIssue(null);
    try {
      const response = await fetch("/api/engines/instances", {
        method: "POST", credentials: "same-origin", cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId, engineKey: "n8n", transport: "http", label: label.trim() }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "ENGINE_REGISTRATION_FAILED");
      setNotice("Instance n8n enregistrée hors ligne. Aucun accès au moteur n’a été activé.");
      setRefresh(value => value + 1);
    } catch (error) {
      const code = error instanceof Error ? error.message : "ENGINE_REGISTRATION_FAILED";
      setIssue(errorMessages[code] ?? "Enregistrement hors ligne impossible.");
    } finally {
      setSubmitting(false);
    }
  }

  return <div className="n8n-console">
    <header className="n8n-hero">
      <div className="n8n-hero-icon"><BrandLogo slug="n8n" size={56} /></div>
      <div className="n8n-hero-body">
        <p className="n8n-eyebrow">MES APPS / AUTOMATISATION</p>
        <h1>n8n, dans votre cockpit Atlas.</h1>
        <p>Préparez une instance et consultez son état depuis le registre Atlas.
          Les workflows, MCP et webhooks seront accessibles seulement après certification.</p>
        <div className="n8n-chips"><span>REST lecture préparée</span><span>MCP à vérifier</span><span>Webhooks verrouillés</span></div>
      </div>
      <span className="n8n-state" data-state={state} role="status">{state === "preconnection" ? "Préconnexion" :
        state === "configuration-error" ? "Configuration serveur invalide" : "Non connecté"}</span>
    </header>

    <section className="n8n-toolbar" aria-label="Workspace de l’intégration n8n">
      <div><strong>Registre partagé Apps / Moteurs</strong>
        <p>L’accès repose sur votre session Atlas et les droits du workspace.</p></div>
      <div className="n8n-toolbar-actions">
        <label htmlFor="n8n-workspace">Workspace</label>
        <select id="n8n-workspace" value={workspaceId}
          onChange={event => { setWorkspaceId(event.target.value); setNotice(null); }}
          disabled={!workspaces.length}>
          {!workspaces.length && <option value="">Aucun workspace</option>}
          {workspaces.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
        </select>
        <button type="button" disabled={!workspaceId || loading}
          onClick={() => setRefresh(value => value + 1)}>{loading ? "Vérification…" : "Actualiser"}</button>
      </div>
    </section>

    {workspaceLoadFailed && <p className="n8n-warning" role="alert">La liste des workspaces n’est pas disponible.</p>}
    {!workspaceLoadFailed && !workspaceId && <p className="n8n-warning" role="status">Aucun workspace Atlas accessible.</p>}
    {issue && <p className="n8n-warning" role="alert">{issue}</p>}
    {notice && <p className="n8n-success" role="status">{notice}</p>}

    <section className="n8n-metrics" aria-label="État réel n8n">
      <div><span>Instances enregistrées</span><strong>{snapshot ? instances.length : "—"}</strong>
        <small>Registre Supabase Atlas</small></div>
      <div><span>Accès fournisseur vérifié</span><strong>Non</strong>
        <small>Aucune preuve d’API n8n réelle</small></div>
      <div><span>Workflows consultables</span><strong>Indisponible</strong>
        <small>Inventaire n8n non interrogé</small></div>
      <div><span>Exécutions activées</span><strong>Non</strong>
        <small>Écritures et webhooks bloqués</small></div>
    </section>

    <section className="n8n-panel" aria-label="Instances n8n enregistrées">
      <div className="n8n-section-heading"><div><p className="n8n-eyebrow">INSTANCE ET IDENTITÉ</p>
        <h2>Vos instances n8n</h2></div><Link href="/engines">Espace Moteurs</Link></div>
      {!snapshot && loading && <p role="status">Lecture du registre…</p>}
      {snapshot && instances.length === 0 && <p>Aucune instance n8n enregistrée pour ce workspace.
        Une configuration serveur seule ne crée pas de connexion.</p>}
      {instances.length > 0 && <ul className="n8n-instances">{instances.map(item =>
        <li key={item.id}><div><strong>{item.label}</strong>
          <small>{item.id} · Transport enregistré : {item.transport.toUpperCase()}</small></div>
          <span>Préconnexion · aucune exécution certifiée</span></li>)}</ul>}
      {snapshot?.serverConfiguration === "ready-for-preconnection" &&
        <p className="n8n-note">Configuration serveur détectée. Aucun endpoint n8n ne sera contacté avant validation du réseau et des autorisations.</p>}
      {snapshot?.serverConfiguration === "invalid" &&
        <p className="n8n-warning" role="alert">La configuration n8n côté serveur nécessite une correction. Aucun secret n’est affiché.</p>}
      {mayRegister && snapshot && !instances.length && <form className="n8n-register" onSubmit={event => void registerOffline(event)}>
        <label htmlFor="n8n-instance-label">Nom de l’instance hors ligne</label>
        <div><input id="n8n-instance-label" value={label} maxLength={120} minLength={1} required
          onChange={event => setLabel(event.target.value)} />
          <button type="submit" disabled={submitting || !label.trim()}>
            {submitting ? "Enregistrement…" : "Enregistrer hors ligne"}</button></div>
        <small>Aucun token, hôte ni workflow n’est ajouté à cette étape.</small>
      </form>}
      {!mayRegister && workspace && <p className="n8n-note">Votre rôle peut consulter le registre.
        Seuls les propriétaires et administrateurs enregistrent une instance.</p>}
    </section>

    <N8nWorkflowRegistry workspaceId={workspaceId} />

    <section className="n8n-surfaces" aria-label="Surfaces techniques n8n">
      <article><span className="n8n-surface-icon" aria-hidden="true">01</span><h2>API REST</h2>
        <p>Client GET côté serveur développé : workflows et statuts d’exécution, pagination et réponses filtrées.</p>
        <strong>Développé · réseau non activé</strong></article>
      <article><span className="n8n-surface-icon" aria-hidden="true">02</span><h2>MCP</h2>
        <p>Les contrats prévoient découverte, création et validation. Aucun outil MCP n’est connecté.</p>
        <strong>Contrats uniquement</strong></article>
      <article><span className="n8n-surface-icon" aria-hidden="true">03</span><h2>Webhooks</h2>
        <p>Le déclenchement et les callbacks nécessiteront approbation, outbox et protection anti-rejeu.</p>
        <strong>Verrouillé</strong></article>
    </section>
    <p className="n8n-footer">n8n reste la source de vérité des workflows. Atlas n’affiche aucune donnée de démonstration comme une connexion réelle et n’exécute aucun workflow dans cette version.</p>
  </div>;
}
