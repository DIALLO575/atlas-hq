"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { BrandLogo } from "@/components/brand-logo";
import { Icon } from "@/components/icon";
import { N8nWorkflowRegistry } from "@/components/n8n-workflow-registry";
import { N8nExecutionRegistry } from "@/components/n8n-execution-registry";
import type { N8nCoordinationView } from "../../packages/engines/n8n/src/coordination.mjs";
import type { Workspace } from "@/lib/workspaces/contract";

type Tab = "overview" | "workflows" | "executions" | "connection";
type Instance = { id: string; label: string; transport: string; registryState: string; createdAt: string };
type Snapshot = {
  engine: "n8n"; state: "not-configured" | "preconnection" | "configuration-error";
  serverConfiguration: "missing" | "ready-for-preconnection" | "invalid";
  instances: Instance[]; connected: false; readOnlyApiEnabled: false;
  workflowInventory: "unavailable"; capabilitiesTestedLive: 0; note: string;
};
type Props = { workspaces: Workspace[]; initialWorkspaceId: string; workspaceLoadFailed: boolean };
type Scoped<T> = { workspaceId: string; data: T };
const tabs: { id: Tab; label: string }[] = [
  { id: "overview", label: "Vue d’ensemble" },
  { id: "workflows", label: "Workflows" },
  { id: "executions", label: "Exécutions" },
  { id: "connection", label: "Connexion & sécurité" },
];
const errorMessages: Record<string, string> = {
  AUTH_REQUIRED: "Votre session a expiré. Reconnectez-vous à Atlas.",
  WORKSPACE_FORBIDDEN: "Vous n’avez pas accès à cet espace de travail.",
  N8N_REGISTRY_UNAVAILABLE: "Le registre des instances est indisponible.",
  ENGINE_REGISTRATION_FAILED: "Impossible d’enregistrer l’instance hors ligne.",
  ENGINE_WRITE_FORBIDDEN: "Seuls les propriétaires et administrateurs peuvent enregistrer une instance.",
};
function dateText(value: string | null) {
  if (!value) return "Jamais observé";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "Date indisponible" :
    new Intl.DateTimeFormat("fr", { dateStyle: "medium" }).format(parsed);
}

export function N8nControlCenter({ workspaces, initialWorkspaceId, workspaceLoadFailed }: Props) {
  const [workspaceId, setWorkspaceId] = useState(initialWorkspaceId);
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [snapshotState, setSnapshot] = useState<Scoped<Snapshot> | null>(null);
  const [overviewState, setOverview] = useState<Scoped<N8nCoordinationView> | null>(null);
  const [loading, setLoading] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [issue, setIssue] = useState<Scoped<string> | null>(null);
  const [label, setLabel] = useState("n8n — automatisations");
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState<Scoped<string> | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void Promise.resolve().then(async () => {
      if (controller.signal.aborted) return;
      setLoading(Boolean(workspaceId));
      setIssue(null);
      if (!workspaceId) { setLoading(false); return; }
      try {
        const [statusResponse, overviewResponse] = await Promise.all([
          fetch("/api/apps/n8n/status?workspaceId=" + encodeURIComponent(workspaceId), {
            credentials: "same-origin", cache: "no-store", signal: controller.signal,
          }),
          fetch("/api/apps/n8n/coordination?workspaceId=" + encodeURIComponent(workspaceId), {
            credentials: "same-origin", cache: "no-store", signal: controller.signal,
          }),
        ]);
        const status = await statusResponse.json() as Snapshot & { error?: string };
        if (!statusResponse.ok || status.engine !== "n8n" || status.connected !== false)
          throw new Error(status.error ?? "N8N_REGISTRY_UNAVAILABLE");
        if (controller.signal.aborted) return;
        setSnapshot({ workspaceId, data: status });
        if (overviewResponse.ok) {
          const overview = await overviewResponse.json() as N8nCoordinationView;
          if (overview.workspaceId === workspaceId && overview.source === "atlas-registry" &&
              overview.providerConnected === false && overview.canStartWorkflow === false) {
            setOverview({ workspaceId, data: overview });
          } else {
            setOverview(null);
            setIssue({ workspaceId, data: "Le résumé des automatisations n’a pas pu être vérifié." });
          }
        } else {
          setOverview(null);
          setIssue({ workspaceId, data: "L’historique des automatisations n’est pas disponible." });
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          const code = error instanceof Error ? error.message : "N8N_REGISTRY_UNAVAILABLE";
          setIssue({ workspaceId, data: errorMessages[code] ?? "Impossible de consulter le centre n8n." });
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    });
    return () => controller.abort();
  }, [workspaceId, refresh]);

  const workspace = workspaces.find(item => item.id === workspaceId);
  const mayRegister = workspace?.role === "owner" || workspace?.role === "admin";
  const snapshot = snapshotState?.workspaceId === workspaceId ? snapshotState.data : null;
  const overview = overviewState?.workspaceId === workspaceId ? overviewState.data : null;
  const message = issue?.workspaceId === workspaceId ? issue.data : null;
  const feedback = notice?.workspaceId === workspaceId ? notice.data : null;
  const instances = snapshot?.instances ?? [];
  const state = snapshot?.state ?? "not-configured";

  async function registerOffline(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!mayRegister || !workspaceId || !snapshot || instances.length || submitting) return;
    const requestedWorkspaceId = workspaceId;
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
      setNotice({ workspaceId: requestedWorkspaceId, data: "Instance n8n enregistrée hors ligne. Aucun accès au moteur n’a été activé." });
      setRefresh(value => value + 1);
    } catch (error) {
      const code = error instanceof Error ? error.message : "ENGINE_REGISTRATION_FAILED";
      setIssue({ workspaceId: requestedWorkspaceId, data: errorMessages[code] ?? "Enregistrement hors ligne impossible." });
    } finally {
      setSubmitting(false);
    }
  }

  return <div className="n8n-console">
    <header className="n8n-hero">
      <div className="n8n-hero-main">
        <div className="n8n-brand-heading">
          <span className="n8n-hero-icon"><BrandLogo slug="n8n" size={45} /></span>
          <div><p className="n8n-eyebrow">ATLAS / MES APPS / AUTOMATISATION</p>
            <h1>n8n <span>Operations Studio</span></h1></div>
        </div>
        <p className="n8n-hero-description">Retrouvez vos instances, explorez les workflows référencés et
          suivez les exécutions enregistrées, depuis une interface Atlas unifiée.</p>
        <div className="n8n-hero-actions">
          <button className="n8n-primary-cta" type="button" onClick={() => setActiveTab("connection")}>
            <Icon name="settings" /> Gérer l’instance <Icon name="arrow-right" />
          </button>
          <button className="n8n-secondary-cta" type="button" onClick={() => setActiveTab("workflows")}>
            <Icon name="workflow" /> Explorer les workflows
          </button>
        </div>
        <div className="n8n-hero-proof"><Icon name="shield-check" />
          Registre Atlas authentifié · Exécution n8n verrouillée</div>
      </div>
      <div className="n8n-hero-diagram" aria-label="Architecture préparatoire, moteur non connecté">
        <span className="n8n-diagram-kicker">ARCHITECTURE / PRÉCONNEXION</span>
        <div className="n8n-diagram-node atlas"><Icon name="layers" /><span>ATLAS HQ</span><small>Orchestration</small></div>
        <div className="n8n-diagram-path"><span>REST</span><span>MCP</span><span>WEBHOOKS</span></div>
        <div className="n8n-diagram-node provider"><BrandLogo slug="n8n" size={29} /><span>n8n</span><small>Non connecté</small></div>
        <div className="n8n-diagram-bottom"><span className="n8n-lock-dot" /> Passerelle inactive · Aucun appel fournisseur</div>
      </div>
    </header>

    <section className="n8n-workspace-bar" aria-label="Pilotage du workspace n8n">
      <div className="n8n-workspace-copy"><span className="n8n-overline">ESPACE ACTIF</span>
        <strong>{workspace?.name ?? "Aucun workspace sélectionné"}</strong>
        <small>Les données et permissions sont isolées par workspace.</small></div>
      <div className="n8n-workspace-controls">
        <label htmlFor="n8n-workspace">Workspace</label>
        <select id="n8n-workspace" value={workspaceId}
          onChange={event => { setWorkspaceId(event.target.value); setNotice(null); }}
          disabled={!workspaces.length || submitting}>
          {!workspaces.length && <option value="">Aucun workspace</option>}
          {workspaces.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
        </select>
        <button className="n8n-refresh" type="button" disabled={!workspaceId || loading}
          onClick={() => setRefresh(value => value + 1)}><Icon name="rotate-ccw" />
          {loading ? "Vérification…" : "Actualiser"}</button>
      </div>
    </section>

    {workspaceLoadFailed && <p className="n8n-warning" role="alert">La liste des workspaces n’est pas disponible.</p>}
    {!workspaceLoadFailed && !workspaceId && <p className="n8n-warning" role="status">Aucun workspace Atlas accessible.</p>}
    {message && <p className="n8n-warning" role="alert">{message}</p>}
    {feedback && <p className="n8n-success" role="status">{feedback}</p>}

    <section className="n8n-metrics" aria-label="État réel des automatisations">
      <div><span>Instances enregistrées</span><strong>{snapshot ? instances.length : "—"}</strong>
        <small>Registre Atlas · hors ligne</small></div>
      <div><span>Workflows référencés</span><strong>{overview ? overview.workflowCountShown + (overview.workflowListTruncated ? "+" : "") : "—"}</strong>
        <small>Entrées affichées · jamais un total distant</small></div>
      <div><span>Exécutions enregistrées</span><strong>{overview ? overview.executionCountShown + (overview.executionListTruncated ? "+" : "") : "—"}</strong>
        <small>Historique Atlas uniquement</small></div>
      <div className="n8n-metric-state"><span>Accès n8n en direct</span><strong>Verrouillé</strong>
        <small>Aucun appel REST, MCP ou webhook</small></div>
    </section>

    <nav className="n8n-tabs" aria-label="Sections du centre n8n">
      {tabs.map(tab => <button type="button" role="tab" key={tab.id}
        aria-selected={activeTab === tab.id} className={activeTab === tab.id ? "is-active" : ""}
        onClick={() => setActiveTab(tab.id)}>
        {tab.label}</button>)}
    </nav>

    {activeTab === "overview" && <div className="n8n-overview-layout" aria-label="Vue d’ensemble n8n">
      <section className="n8n-panel n8n-overview-primary">
        <div className="n8n-section-heading"><div><p className="n8n-eyebrow">VOTRE AUTOMATISATION</p>
          <h2>Un cockpit pour les opérations</h2></div><span className="n8n-small-pill">Lecture du registre</span></div>
        <p>Explorez vos métadonnées n8n sans quitter Atlas. Les actions fournisseur s’activeront
          seulement après certification technique, des droits et de la licence.</p>
        <div className="n8n-capability-grid">
          <button type="button" onClick={() => setActiveTab("workflows")}>
            <span className="n8n-capability-icon"><Icon name="workflow" /></span>
            <strong>Workflows</strong><small>Rechercher, filtrer et consulter les références existantes</small>
            <span className="n8n-capability-link">Ouvrir le registre <Icon name="arrow-right" /></span>
          </button>
          <button type="button" onClick={() => setActiveTab("executions")}>
            <span className="n8n-capability-icon"><Icon name="activity" /></span>
            <strong>Exécutions</strong><small>Examiner les statuts et missions liées</small>
            <span className="n8n-capability-link">Voir l’historique <Icon name="arrow-right" /></span>
          </button>
          <button type="button" onClick={() => setActiveTab("connection")}>
            <span className="n8n-capability-icon"><Icon name="shield-check" /></span>
            <strong>Connexion</strong><small>Enregistrer l’instance et consulter la sécurité</small>
            <span className="n8n-capability-link">Gérer <Icon name="arrow-right" /></span>
          </button>
        </div>
      </section>
      <aside className="n8n-panel n8n-health-panel">
        <p className="n8n-eyebrow">ÉTAT DE LA PASSERELLE</p><h2>Connexion au moteur</h2>
        <span className="n8n-state" data-state={state} role="status">
          {state === "preconnection" ? "Préconnexion" :
            state === "configuration-error" ? "Configuration à corriger" : "Non connecté"}
        </span>
        <ol className="n8n-health-steps">
          <li className={instances.length ? "is-present" : ""}><span>01</span>
            <div><strong>Instance Atlas</strong><small>{instances.length ? "Instance enregistrée dans ce workspace" : "Enregistrement hors ligne à effectuer"}</small></div></li>
          <li className={snapshot?.serverConfiguration === "ready-for-preconnection" ? "is-present" : ""}><span>02</span>
            <div><strong>Configuration serveur</strong><small>
              {snapshot?.serverConfiguration === "ready-for-preconnection" ? "Préconfiguration détectée" :
                snapshot?.serverConfiguration === "invalid" ? "Configuration invalide" : "Aucune configuration attestée"}</small></div></li>
          <li><span>03</span><div><strong>Connexion n8n certifiée</strong><small>Non validée · accès fermé</small></div></li>
        </ol>
        <button type="button" className="n8n-text-action" onClick={() => setActiveTab("connection")}>
          Voir le diagnostic <Icon name="arrow-right" /></button>
      </aside>
      <section className="n8n-panel n8n-cross-links">
        <div className="n8n-section-heading"><div><p className="n8n-eyebrow">DANS ATLAS</p>
          <h2>Un moteur, plusieurs espaces</h2></div></div>
        <div className="n8n-cross-grid">
          {[{title:"Chief",href:"/chief",icon:"spark" as const,detail:"Contexte et briefing"},
            {title:"Agents & Équipes",href:"/agents",icon:"bot" as const,detail:"Automatisations, pas agents certifiés"},
            {title:"Missions",href:"/missions",icon:"activity" as const,detail:"Suivi des exécutions liées"},
            {title:"Moteurs IA",href:"/engines",icon:"layers" as const,detail:"Registre des moteurs"}]
            .map(item => <Link key={item.href} href={item.href + "?workspaceId=" + encodeURIComponent(workspaceId)}>
              <Icon name={item.icon} /><span><strong>{item.title}</strong><small>{item.detail}</small></span>
              <Icon name="arrow-up-right" /></Link>)}
        </div>
      </section>
    </div>}

    {activeTab === "workflows" && <div className="n8n-workarea" role="tabpanel">
      <N8nWorkflowRegistry workspaceId={workspaceId} />
    </div>}

    {activeTab === "executions" && <div className="n8n-workarea" role="tabpanel">
      <N8nExecutionRegistry workspaceId={workspaceId} />
    </div>}

    {activeTab === "connection" && <div className="n8n-workarea" role="tabpanel">
      <section className="n8n-panel" aria-label="Instances n8n enregistrées">
        <div className="n8n-section-heading"><div><p className="n8n-eyebrow">INSTANCE ET IDENTITÉ</p>
          <h2>Vos instances n8n</h2></div><Link href="/engines">Espace Moteurs <Icon name="arrow-up-right" /></Link></div>
        {!snapshot && loading && <p role="status">Lecture du registre…</p>}
        {snapshot && !instances.length && <div className="n8n-empty-state">
          <span className="n8n-empty-icon"><Icon name="layers" /></span><h3>Aucune instance enregistrée</h3>
          <p>Une configuration serveur seule ne crée pas de connexion. Enregistrez d’abord une instance Atlas hors ligne.</p></div>}
        {!!instances.length && <ul className="n8n-instances">{instances.map(item =>
          <li key={item.id}><div><strong>{item.label}</strong><small>
            {item.id} · Transport : {item.transport.toUpperCase()} · {dateText(item.createdAt)}</small></div>
            <span>Hors ligne · aucune exécution certifiée</span></li>)}</ul>}
        {snapshot?.serverConfiguration === "ready-for-preconnection" &&
          <p className="n8n-note">Préconfiguration serveur détectée. Aucun endpoint n8n n’est contacté sans certification.</p>}
        {snapshot?.serverConfiguration === "invalid" &&
          <p className="n8n-warning" role="alert">Configuration serveur n8n invalide. Aucun secret n’est affiché.</p>}
        {mayRegister && snapshot && !instances.length && <form className="n8n-register" onSubmit={event => void registerOffline(event)}>
          <label htmlFor="n8n-instance-label">Nom de l’instance (enregistrement hors ligne)</label>
          <div><input id="n8n-instance-label" value={label} maxLength={120} minLength={1} required
            onChange={event => setLabel(event.target.value)} />
            <button type="submit" disabled={submitting || !label.trim()}>
              {submitting ? "Enregistrement…" : "Enregistrer hors ligne"}</button></div>
          <small>Cette action crée uniquement une fiche dans le registre Atlas. Aucun token, hôte ou workflow n’est ajouté.</small>
        </form>}
        {!mayRegister && workspace && <p className="n8n-note">Votre rôle permet de consulter le registre.
          Seuls les propriétaires et administrateurs peuvent enregistrer une instance.</p>}
      </section>
      <section className="n8n-panel" aria-label="Périmètre de sécurité n8n">
        <div className="n8n-section-heading"><div><p className="n8n-eyebrow">ACCÈS ET PERMISSIONS</p>
          <h2>Capacités n8n dans Atlas</h2></div><span className="n8n-small-pill">Protection active</span></div>
        <div className="n8n-surface-matrix">
          <div><strong>API REST</strong><span>Lecture préparée</span><small>Aucun accès distant activé</small></div>
          <div><strong>MCP</strong><span>Contrats validés</span><small>Outils non appelables</small></div>
          <div><strong>Webhooks</strong><span>Verrouillés</span><small>Déclenchement et callbacks fermés</small></div>
          <div><strong>Exécution</strong><span>Non autorisée</span><small>Approbations et worker à certifier</small></div>
        </div>
        <p className="n8n-security-note"><Icon name="shield-check" />
          Les permissions et le verrou SQL n8n restent appliqués côté serveur.
          Aucun utilisateur ne peut activer les workflows depuis cet écran.</p>
      </section>
    </div>}

    <footer className="n8n-footer">n8n est la source de vérité des workflows distants.
      Atlas n’affiche ici que les informations réellement enregistrées dans son registre ;
      aucune donnée de démonstration ne représente une connexion réelle.</footer>
  </div>;
}
