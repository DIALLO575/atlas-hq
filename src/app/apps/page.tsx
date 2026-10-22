"use client";

import { useState } from "react";
import { AppShell } from "@/components/app-shell";
import { DemoNotice, PageHeading } from "@/components/page-elements";
import { Icon } from "@/components/icon";

type ProviderId = "github" | "linear";
type CapabilityStatus = "unknown";

type Provider = {
  id: ProviderId;
  name: string;
  mark: string;
  description: string;
  capabilities: { id: string; label: string; detail: string; status: CapabilityStatus }[];
  permissions: string;
};

const providers: Provider[] = [
  {
    id: "github",
    name: "GitHub",
    mark: "GH",
    description: "Retrouvez vos dépôts, issues et ressources liées dans ATLAS HQ.",
    permissions: "Les permissions seront affichées et vérifiées pendant l’autorisation.",
    capabilities: [
      { id: "issues.search", label: "Rechercher des issues", detail: "Recherche dans les issues accessibles au compte autorisé.", status: "unknown" },
      { id: "issues.read", label: "Lire une issue", detail: "Consulter le contenu et l’état d’une issue.", status: "unknown" },
      { id: "issues.create", label: "Créer une issue", detail: "Préparer une création, puis demander une approbation.", status: "unknown" },
    ],
  },
  {
    id: "linear",
    name: "Linear",
    mark: "L",
    description: "Consultez vos équipes et issues Linear depuis le cockpit.",
    permissions: "Les permissions seront affichées et vérifiées pendant l’autorisation.",
    capabilities: [
      { id: "issues.search", label: "Rechercher des issues", detail: "Recherche dans les issues accessibles au compte autorisé.", status: "unknown" },
      { id: "issues.read", label: "Lire une issue", detail: "Consulter le contenu et l’état d’une issue.", status: "unknown" },
      { id: "issues.create", label: "Créer une issue", detail: "Préparer une création, puis demander une approbation.", status: "unknown" },
      { id: "webhooks.subscribe", label: "Recevoir les mises à jour", detail: "Synchronisation événementielle, quand elle sera disponible.", status: "unknown" },
    ],
  },
];

function CapabilityBadge({ status }: { status: CapabilityStatus }) {
  const label = { unknown: "À vérifier" }[status];
  return <span className="capability-status"><span aria-hidden="true"/>{label}</span>;
}

export default function AppsPage() {
  const [selected, setSelected] = useState<ProviderId>("github");
  const provider = providers.find((item) => item.id === selected)!;

  return <AppShell><main className="main-content connector-page" id="main-content">
    <PageHeading eyebrow="CONNECTEURS ATLAS" title="Mes Apps" description="Connectez vos outils et choisissez, pour chaque compte, les capacités réellement autorisées." />
    <DemoNotice/>

    <section className="connector-intro" aria-labelledby="connector-intro-title">
      <div><p className="eyebrow">BIBLIOTHÈQUE DE CONNECTEURS</p><h2 id="connector-intro-title">Une connexion, des capacités vérifiées</h2><p>Après autorisation, ATLAS HQ affichera le compte ciblé, les accès accordés et les synchronisations confirmées.</p></div>
      <span className="connector-count">2 connecteurs prioritaires</span>
    </section>

    <div className="connector-layout">
      <nav className="connector-list" aria-label="Connecteurs disponibles">
        {providers.map((item) => <button key={item.id} type="button" className={`connector-choice ${selected === item.id ? "connector-choice-active" : ""}`} onClick={() => setSelected(item.id)} aria-pressed={selected === item.id}>
          <span className={`space-mark ${item.id}`}>{item.mark}</span><span className="connector-choice-copy"><strong>{item.name}</strong><small>Connecteur disponible</small></span><span className="connector-unconnected"><i aria-hidden="true"/>Non connecté</span>
        </button>)}
        <p className="connector-list-note">D’autres connecteurs seront ajoutés à la bibliothèque après validation de leurs intégrations.</p>
      </nav>

      <div className="connector-detail" aria-live="polite">
        <section className="connector-card" aria-labelledby="provider-title">
          <header className="connector-card-header">
            <span className={`provider-mark space-mark ${provider.id}`}>{provider.mark}</span>
            <div className="provider-heading"><p className="eyebrow">CONNECTEUR</p><h2 id="provider-title">{provider.name}</h2><p>{provider.description}</p></div>
            <span className="status-label status-neutral"><i aria-hidden="true"/>Non connecté</span>
          </header>
          <div className="connector-connection-grid">
            <div><span>Compte ciblé</span><strong>Aucun compte autorisé</strong></div>
            <div><span>Workspace / dépôt</span><strong>Indisponible avant connexion</strong></div>
            <div><span>Dernière vérification</span><strong>Jamais synchronisé</strong></div>
            <div><span>État d’accès</span><strong>Non autorisé</strong></div>
          </div>
          <div className="connector-connect-row">
            <div><strong>Connexion sécurisée</strong><p>Le parcours OAuth et la révocation seront gérés par le serveur. Aucun token ni réglage API/MCP/webhook ne sera demandé ici.</p></div>
            <button className="connect-button" type="button" disabled aria-describedby="connect-unavailable"><Icon name="link"/>Connexion bientôt disponible</button>
          </div>
          <p id="connect-unavailable" className="connector-inline-note">Le backend d’authentification n’est pas encore raccordé. Aucun accès fournisseur n’a été établi.</p>
        </section>

        <section className="connector-section" aria-labelledby="capabilities-title">
          <div className="connector-section-heading"><div><p className="eyebrow">ACCÈS PAR CONNEXION</p><h2 id="capabilities-title">Capacités du connecteur</h2></div><span className="quiet-tag">NON VÉRIFIÉES</span></div>
          <p className="connector-section-copy">Une capacité n’est utilisable que si le serveur confirme les permissions du compte connecté.</p>
          <ul className="capability-list">
            {provider.capabilities.map((capability) => <li key={capability.id} className="capability-row"><span className="capability-icon" aria-hidden="true"><Icon name={capability.id === "webhooks.subscribe" ? "activity" : "layers"}/></span><span className="capability-copy"><strong>{capability.label}</strong><small>{capability.detail}</small></span><CapabilityBadge status={capability.status}/></li>)}
          </ul>
          <div className="permissions-note"><Icon name="settings"/><p><strong>Autorisations du fournisseur</strong><span>{provider.permissions}</span></p></div>
        </section>

        <div className="connector-lower-grid">
          <section className="connector-section compact-section" aria-labelledby="resources-title">
            <div className="connector-section-heading"><div><p className="eyebrow">RELATIONSHIP ENGINE</p><h2 id="resources-title">Ressources liées</h2></div></div>
            <div className="connector-empty"><span className="empty-panel-icon"><Icon name="link"/></span><div><strong>Aucune ressource synchronisée</strong><p>Les dépôts, équipes et issues apparaîtront après une connexion et une synchronisation vérifiées.</p></div></div>
            <p className="freshness-line"><span className="freshness-dot" aria-hidden="true"/>Fraîcheur : inconnue <span>·</span> aucune synchronisation enregistrée</p>
            <p className="sync-error-note"><strong>Incidents de synchronisation</strong><span>Indisponibles avant le raccordement du backend.</span></p>
          </section>
          <section className="connector-section compact-section" aria-labelledby="actions-title">
            <div className="connector-section-heading"><div><p className="eyebrow">ACTIONS ET CONTRÔLES</p><h2 id="actions-title">Actions directes</h2></div></div>
            <div className="action-row"><span><strong>Créer une issue</strong><small>Approbation requise avant exécution</small></span><button className="action-disabled" type="button" disabled>Indisponible</button></div>
            <div className="approval-empty"><Icon name="inbox"/><span><strong>Aucune approbation en attente</strong><small>Les demandes s’afficheront ici avec leur aperçu à confirmer.</small></span></div>
          </section>
        </div>
        <p className="connector-provenance">État de démonstration — aucune connexion, capacité, ressource ou activité réelle n’est chargée depuis {provider.name}.</p>
      </div>
    </div>
  </main></AppShell>;
}
