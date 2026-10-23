"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { BrandLogo } from "@/components/brand-logo";
import { Icon } from "@/components/icon";
import { dockTools, integrationExamples, MAX_PINNED_TOOLS, type DockToolId } from "@/lib/dock-tools";

type Tab = "tools" | "agents";

type Props = {
  onClose: () => void;
  onNavigate: () => void;
  pinnedIds: readonly DockToolId[];
  onTogglePin: (id: DockToolId) => void;
};

export function DockToolspace({ onClose, onNavigate, pinnedIds, onTogglePin }: Props) {
  const [tab, setTab] = useState<Tab>("tools");
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("fr");
    return dockTools.filter((tool) =>
      !q || (tool.name + " " + tool.description + " " + tool.category).toLocaleLowerCase("fr").includes(q));
  }, [query]);

  return (
    <section className="atlas-toolspace" id="atlas-dock-toolspace" aria-label="Espace d'outils Atlas">
      <header className="atlas-toolspace-header">
        <span className="atlas-toolspace-monogram" aria-hidden="true">A</span>
        <div className="atlas-toolspace-header-copy">
          <span className="atlas-toolspace-eyebrow">VOTRE ESPACE FLOTTANT</span>
          <h2>Atlas Dock</h2>
        </div>
        <button type="button" className="atlas-toolspace-close" onClick={onClose} aria-label="Fermer les outils">
          <Icon name="close" />
        </button>
      </header>

      <div className="atlas-toolspace-intro">
        <span className="atlas-toolspace-orb"><Icon name="spark" /></span>
        <div><strong>Vos outils, à portée de main.</strong><p>Un lanceur indépendant pour naviguer, retrouver vos apps et préparer vos agents.</p></div>
      </div>

      <div className="atlas-toolspace-tabs" role="group" aria-label="Vue de l’espace">
        <button type="button" aria-pressed={tab === "tools"} className={tab === "tools" ? "is-active" : ""} onClick={() => setTab("tools")}>
          <Icon name="apps" /> Outils
        </button>
        <button type="button" aria-pressed={tab === "agents"} className={tab === "agents" ? "is-active" : ""} onClick={() => setTab("agents")}>
          <Icon name="bot" /> Agents IA
        </button>
      </div>

      {tab === "tools" ? (
        <div className="atlas-toolspace-content">
          <div className="atlas-toolspace-search">
            <Icon name="search" />
            <label htmlFor="atlas-dock-search" className="sr-only">Rechercher un outil du dock</label>
            <input id="atlas-dock-search" type="search" placeholder="Rechercher un outil..." value={query} onChange={(event) => setQuery(event.target.value)} />
            <kbd>↵</kbd>
          </div>

          <div className="atlas-toolspace-section-header"><h3>Raccourcis Atlas</h3><span>{pinnedIds.length}/{MAX_PINNED_TOOLS} épinglés</span></div>
          <div className="atlas-toolspace-tool-list" role="list">
            {filtered.map((tool) => {
              const pinned = pinnedIds.includes(tool.id);
              const maxed = !pinned && pinnedIds.length >= MAX_PINNED_TOOLS;
              return (
                <div className="atlas-toolspace-tool" role="listitem" key={tool.id}>
                  <Link href={tool.href} onClick={onNavigate} className="atlas-toolspace-tool-main" aria-label={"Ouvrir " + tool.name}>
                    <span className="atlas-toolspace-tool-icon"><Icon name={tool.icon} /></span>
                    <span><strong>{tool.name}</strong><small>{tool.description}</small></span>
                  </Link>
                  <button type="button" className={pinned ? "atlas-toolspace-pin is-pinned" : "atlas-toolspace-pin"}
                    onClick={() => onTogglePin(tool.id)}
                    disabled={maxed}
                    aria-pressed={pinned}
                    aria-label={(pinned ? "Retirer " : "Épingler ") + tool.name + (pinned ? " du dock" : " au dock")}
                    title={maxed ? "Maximum 3 raccourcis épinglés" : pinned ? "Retirer du dock" : "Épingler au dock"}>
                    <Icon name="pin" />
                  </button>
                </div>
              );
            })}
            {filtered.length === 0 && <p className="atlas-toolspace-no-results">Aucun outil trouvé.</p>}
          </div>

          <div className="atlas-toolspace-section-header"><h3>Applications à connecter</h3><Link href="/apps" onClick={onNavigate}>Catalogue <Icon name="arrow-right"/></Link></div>
          <div className="atlas-toolspace-integrations">
            {integrationExamples.map((app) => (
              <Link key={app.slug} href="/apps" onClick={onNavigate} title={app.description} aria-label={"Explorer " + app.name + " dans le catalogue"}>
                <span><BrandLogo slug={app.slug} size={22} /></span>
                <strong>{app.name}</strong>
                <small>À connecter</small>
              </Link>
            ))}
          </div>
          <p className="atlas-toolspace-footnote">Ces raccourcis ouvrent Atlas. Ils ne déclenchent pas d’action extérieure.</p>
        </div>
      ) : (
        <div className="atlas-toolspace-content atlas-toolspace-agents">
          <div className="atlas-toolspace-agent-status">
            <span className="atlas-toolspace-agent-visual"><Icon name="bot" /></span>
            <strong>Vos agents bientôt dans le dock</strong>
            <p>Connectez Hermes ou un autre assistant pour retrouver ici ses outils autorisés et ses demandes.</p>
            <Link href="/agents" onClick={onNavigate}>Explorer les agents <Icon name="arrow-up-right" /></Link>
          </div>
          <div className="atlas-toolspace-section-header"><h3>Comment les agents utiliseront les outils</h3></div>
          <div className="atlas-toolspace-safety">
            <div><span>01</span><strong>Outil disponible</strong><small>Connexion vérifiée à l’application</small></div>
            <div><span>02</span><strong>Autorisation contrôlée</strong><small>Droits définis pour chaque workspace</small></div>
            <div><span>03</span><strong>Approbation humaine</strong><small>Validation avant une action sensible</small></div>
          </div>
          <p className="atlas-toolspace-footnote">L’exécution des outils par des agents n’est pas encore active. Aucune permission n’est accordée depuis ce dock.</p>
        </div>
      )}
    </section>
  );
}
