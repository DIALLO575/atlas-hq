"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Icon } from "@/components/icon";
import { BrandLogo } from "@/components/brand-logo";
import { appCategories, atlasApps, type AppCategory } from "@/lib/app-catalog";

function normalized(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("fr");
}

export function AppsDirectory({ githubSlot, githubConfigured, hasVerifiedGitHub }: {
  githubSlot?: ReactNode;
  githubConfigured?: boolean;
  hasVerifiedGitHub?: boolean;
}) {
  const [category, setCategory] = useState<(typeof appCategories)[number]>("Toutes");
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const term = normalized(query.trim());
    return atlasApps.filter((app) => {
      const matchesCategory = category === "Toutes" || app.category === category;
      const matchesQuery = !term || normalized(app.name + " " + app.category + " " + app.description).includes(term);
      return matchesCategory && matchesQuery;
    });
  }, [category, query]);

  return (
    <>
      <section className="atlas-apps-connected" aria-labelledby="apps-connected-title">
        <span className="atlas-apps-connected-icon"><Icon name="link" /></span>
        <div>
          <h2 id="apps-connected-title">Mes connexions</h2>
          <p>{hasVerifiedGitHub ? "Installation GitHub vérifiée. Les ressources restent soumises aux permissions du Workspace." :
    "Vos applications réellement connectées apparaîtront ici dès l’activation des intégrations."}</p>
        </div>
        <span className="atlas-apps-empty-pill">{hasVerifiedGitHub ? "GitHub autorisé" : "Aucune connexion active"}</span>
      </section>

      {githubSlot}
      <section className="atlas-directory" aria-labelledby="atlas-directory-title">
        <header className="atlas-directory-heading">
          <div>
            <p className="atlas-overline">VOTRE ÉCOSYSTÈME</p>
            <h2 id="atlas-directory-title">Explorer les applications</h2>
            <p>Choisissez les outils que vous souhaiterez relier à vos agents.</p>
          </div>
          <span className="atlas-directory-total">{atlasApps.length} applications</span>
        </header>

        <div className="atlas-directory-controls">
          <div className="atlas-directory-search" role="search">
            <Icon name="search" />
            <label className="sr-only" htmlFor="atlas-apps-search">Rechercher une application</label>
            <input id="atlas-apps-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)}
              placeholder="Rechercher une application..." autoComplete="off" />
          </div>
          <div className="atlas-apps-category-filters" role="group" aria-label="Filtrer les applications">
            {appCategories.map((item) => (
              <button key={item} type="button" aria-pressed={category === item}
                className={"atlas-apps-filter" + (category === item ? " is-selected" : "")}
                onClick={() => setCategory(item)}>{item}</button>
            ))}
          </div>
        </div>

        <p className="atlas-directory-count" role="status" aria-live="polite">
          {filtered.length} résultat{filtered.length > 1 ? "s" : ""}{category !== "Toutes" ? " · " + (category as AppCategory) : ""}
        </p>

        {filtered.length > 0 ? (
          <div className="atlas-directory-grid">
            {filtered.map((app) => (
              <article className="atlas-integration-card" key={app.slug}>
                <div className="atlas-integration-top">
                  <span className="atlas-integration-logo"><BrandLogo slug={app.slug} size={40} /></span>
                  <span className="atlas-integration-status">{app.slug === "github"
                  ? hasVerifiedGitHub ? "Installation vérifiée" : githubConfigured ? "Connexion disponible" : "Configuration requise"
                  : "À venir"}</span>
                </div>
                <h3>{app.name}</h3>
                <p className="atlas-integration-description">{app.description}</p>
                <div className="atlas-integration-category">{app.category}</div>
                <div className="atlas-integration-footer">
                  <span>Non connectée</span>
                  {app.slug === "github" && githubConfigured ?
                    <a href="#atlas-github-connection" className="atlas-apps-connect-link">
                      Configurer <Icon name="arrow-up-right" />
                    </a> :
                    <button type="button" disabled aria-label={"Connexion à " + app.name + " bientôt disponible"} title="Intégration en préparation">
                      Connecter <Icon name="arrow-up-right" />
                    </button>}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="atlas-directory-no-results">
            <Icon name="search" />
            <h3>Aucune application trouvée</h3>
            <p>Essayez un autre nom ou une autre catégorie.</p>
            <button type="button" onClick={() => { setQuery(""); setCategory("Toutes"); }}>Réinitialiser les filtres</button>
          </div>
        )}
        <p className="atlas-directory-footnote">Catalogue de présentation. Les connexions ne sont pas encore disponibles pour les autres applications.</p>
      </section>
    </>
  );
}
