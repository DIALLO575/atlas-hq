"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/icon";
import { BrandLogo } from "@/components/brand-logo";
import { appCategories, atlasApps, recommendedApps, type CatalogApp } from "@/lib/app-catalog";

type Filter = (typeof appCategories)[number] | "Recommandées" | "Favoris";
const filters: Filter[] = ["Toutes", "Favoris", "Recommandées", ...appCategories.filter((cat) => cat !== "Toutes")];
const FAVORITES_KEY = "atlas:favorite-apps-v1";
const PAGE_SIZE = 8;

function normalized(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("fr");
}

export function AppsDirectory() {
  const [filter, setFilter] = useState<Filter>("Toutes");
  const [query, setQuery] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [selected, setSelected] = useState<CatalogApp | null>(null);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      try {
        const saved: unknown = JSON.parse(window.localStorage.getItem(FAVORITES_KEY) ?? "[]");
        if (Array.isArray(saved)) {
          setFavorites(saved.filter((slug): slug is string =>
            typeof slug === "string" && atlasApps.some((app) => app.slug === slug)));
        }
      } catch {
        // Favorites are optional when storage is blocked.
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  const toggleFavorite = (slug: string) => {
    const next = favorites.includes(slug) ? favorites.filter((item) => item !== slug) : [...favorites, slug];
    setFavorites(next);
    try { window.localStorage.setItem(FAVORITES_KEY, JSON.stringify(next)); } catch {}
  };

  const results = useMemo(() => {
    const term = normalized(query.trim());
    return atlasApps.filter((app) => {
      const matchesGroup = filter === "Toutes" ||
        (filter === "Favoris" ? favorites.includes(app.slug) :
          filter === "Recommandées" ? !!app.recommended : app.category === filter);
      return matchesGroup &&
        (!term || normalized(app.name + " " + app.category + " " + app.description).includes(term));
    });
  }, [filter, query, favorites]);

  const visible = showAll ? results : results.slice(0, PAGE_SIZE);

  const selectFilter = (value: Filter) => {
    setFilter(value);
    setShowAll(false);
  };

  const clearFilters = () => {
    setFilter("Toutes");
    setQuery("");
    setShowAll(false);
  };

  return (
    <>
      <section className="atlas-apps-stats" aria-label="Votre espace d'intégrations">
        <div className="atlas-apps-stat"><span className="atlas-apps-stat-icon"><Icon name="apps" /></span><div><strong>{atlasApps.length}</strong><span>Apps à découvrir</span><small>Catalogue Atlas</small></div></div>
        <div className="atlas-apps-stat"><span className="atlas-apps-stat-icon is-lilac"><Icon name="layers" /></span><div><strong>{appCategories.length - 1}</strong><span>Catégories</span><small>Outils pour vos équipes</small></div></div>
        <div className="atlas-apps-stat"><span className="atlas-apps-stat-icon is-indigo"><Icon name="spark" /></span><div><strong>{recommendedApps.length}</strong><span>Recommandées</span><small>À explorer en priorité</small></div></div>
        <div className="atlas-apps-stat"><span className="atlas-apps-stat-icon is-rose"><Icon name="link" /></span><div><strong className="atlas-apps-stat-word">À venir</strong><span>Connexions actives</span><small>Intégrations en préparation</small></div></div>
      </section>

      <section className="atlas-apps-connected-banner" aria-label="État des connexions">
        <span className="atlas-apps-connected-symbol"><Icon name="link" /></span>
        <div><strong>Vos connexions, bientôt au même endroit</strong>
          <p>Le catalogue est disponible. Le suivi des connexions réelles et les autorisations arrivent dans une prochaine étape.</p></div>
        <span className="atlas-apps-soon">Aucune connexion suivie</span>
      </section>

      <div className="atlas-apps-toolbar" id="apps-catalog">
        <div className="atlas-apps-filters" role="group" aria-label="Filtrer les applications">
          {filters.map((item) => (
            <button key={item} type="button" aria-pressed={filter === item}
              className={"atlas-apps-filter" + (filter === item ? " is-selected" : "")}
              onClick={() => selectFilter(item)}>{item}</button>
          ))}
        </div>
        <div className="atlas-apps-search" role="search">
          <Icon name="search" />
          <label htmlFor="atlas-apps-search" className="sr-only">Rechercher une application</label>
          <input id="atlas-apps-search" type="search" value={query} onChange={(event) => { setQuery(event.target.value); setShowAll(false); }}
            placeholder="Rechercher une application..." autoComplete="off" />
          {query && <button aria-label="Effacer la recherche" type="button" onClick={() => setQuery("")}><Icon name="close" /></button>}
        </div>
      </div>

      <div className="atlas-apps-content-grid">
        <div className="atlas-apps-main-column">
          <section className="atlas-apps-section" aria-labelledby="atlas-apps-catalog-heading">
            <header className="atlas-apps-section-heading">
              <div><h2 id="atlas-apps-catalog-heading">{filter === "Favoris" ? "Vos applications favorites" : filter === "Recommandées" ? "Recommandées pour Atlas" : "Applications à découvrir"}</h2>
                <p>Des outils pour enrichir vos futurs workflows.</p></div>
              <span className="atlas-apps-result-count" role="status" aria-live="polite">{results.length} application{results.length > 1 ? "s" : ""}</span>
            </header>

            {results.length ? (
              <>
                <div className="atlas-apps-tiles">
                  {visible.map((app) => (
                    <article className={"atlas-app-tile" + (selected?.slug === app.slug ? " is-inspected" : "")} key={app.slug}>
                      <div className="atlas-app-tile-header">
                        <span className="atlas-app-tile-logo"><BrandLogo slug={app.slug} size={38} /></span>
                        <button type="button" className={"atlas-app-favorite" + (favorites.includes(app.slug) ? " is-favorite" : "")}
                          onClick={() => toggleFavorite(app.slug)} aria-pressed={favorites.includes(app.slug)}
                          aria-label={(favorites.includes(app.slug) ? "Retirer " : "Ajouter ") + app.name + (favorites.includes(app.slug) ? " des favoris" : " aux favoris")} title="Favoris">
                          <Icon name="pin" />
                        </button>
                      </div>
                      <h3>{app.name}</h3>
                      <p className="atlas-app-tile-description">{app.description}</p>
                      <div className="atlas-app-tile-meta"><span>{app.category}</span>{app.recommended && <span className="atlas-app-recommend-dot" title="Recommandée">✦</span>}</div>
                      <div className="atlas-app-tile-footer">
                        <span className="atlas-app-connection-state"><i />À venir</span>
                        <button className="atlas-app-details" type="button" onClick={() => setSelected(selected?.slug === app.slug ? null : app)}
                          aria-label={"Voir les détails de " + app.name} aria-expanded={selected?.slug === app.slug}>
                          Détails <Icon name="arrow-up-right" />
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
                {results.length > PAGE_SIZE && (
                  <button type="button" className="atlas-apps-more" onClick={() => setShowAll(!showAll)}>
                    {showAll ? "Afficher moins" : "Voir toutes les applications"}
                    <Icon name={showAll ? "chevron-left" : "arrow-right"} />
                  </button>
                )}
              </>
            ) : (
              <div className="atlas-apps-no-results">
                <span className="atlas-apps-no-icon"><Icon name="search" /></span>
                <h3>{filter === "Favoris" && !query ? "Aucun favori pour l'instant" : "Aucune application trouvée"}</h3>
                <p>{filter === "Favoris" && !query ? "Épinglez les outils que vous souhaitez retrouver facilement." : "Essayez un autre nom ou une autre catégorie."}</p>
                <button type="button" onClick={clearFilters}>Voir toutes les applications</button>
              </div>
            )}
          </section>

          <section className="atlas-apps-recommended" aria-labelledby="atlas-apps-reco-heading">
            <div className="atlas-apps-section-heading">
              <div><h2 id="atlas-apps-reco-heading">Recommandées pour Atlas <span className="atlas-apps-count-purple">{recommendedApps.length}</span></h2>
                <p>Une sélection pour compléter votre espace de travail.</p></div>
              <button type="button" className="atlas-apps-view-recommended" onClick={() => { selectFilter("Recommandées"); document.getElementById("apps-catalog")?.scrollIntoView({behavior:"smooth",block:"start"}); }}>
                Tout voir <Icon name="arrow-right" />
              </button>
            </div>
            <div className="atlas-apps-reco-grid">
              {recommendedApps.map((app) => (
                <button type="button" className="atlas-app-reco-item" key={app.slug} onClick={() => setSelected(app)}>
                  <span className="atlas-app-reco-logo"><BrandLogo slug={app.slug} size={34} /></span>
                  <span className="atlas-app-reco-copy"><strong>{app.name}</strong><small>{app.description}</small><em>Recommandée <Icon name="arrow-up-right" /></em></span>
                </button>
              ))}
            </div>
          </section>
        </div>

        <aside className="atlas-apps-sidebar" aria-label="Actions et informations">
          <section className="atlas-apps-side-panel">
            <h2><span className="atlas-apps-side-spark"><Icon name="spark" /></span> Actions rapides</h2>
            <Link href="#apps-catalog" className="atlas-apps-action-row"><span className="atlas-action-icon"><Icon name="apps" /></span><span><strong>Explorer les intégrations</strong><small>Parcourir les outils disponibles</small></span><Icon name="arrow-right" /></Link>
            <Link href="/agents" className="atlas-apps-action-row"><span className="atlas-action-icon"><Icon name="bot" /></span><span><strong>Voir mes agents</strong><small>Préparer leurs futurs outils</small></span><Icon name="arrow-right" /></Link>
            <Link href="/missions" className="atlas-apps-action-row"><span className="atlas-action-icon"><Icon name="activity" /></span><span><strong>Mes missions</strong><small>Retrouver le travail en cours</small></span><Icon name="arrow-right" /></Link>
          </section>

          {selected && (
            <section className="atlas-apps-side-panel atlas-apps-inspection" aria-labelledby="atlas-app-detail-heading">
              <div className="atlas-apps-inspection-header">
                <span className="atlas-app-reco-logo"><BrandLogo slug={selected.slug} size={34} /></span>
                <button type="button" onClick={() => setSelected(null)} aria-label="Fermer la fiche d'application"><Icon name="close" /></button>
              </div>
              <h2 id="atlas-app-detail-heading">{selected.name}</h2>
              <span className="atlas-apps-detail-category">{selected.category}</span>
              <p>{selected.useCase}</p>
              <div className="atlas-apps-detail-notice"><Icon name="link" /> Connexion à venir : aucun accès à votre compte n'est demandé.</div>
              <button className="atlas-apps-detail-favorite" type="button" onClick={() => toggleFavorite(selected.slug)}>
                <Icon name="pin" /> {favorites.includes(selected.slug) ? "Retirer des favoris" : "Ajouter à mes favoris"}
              </button>
            </section>
          )}

          <section className="atlas-apps-side-panel atlas-apps-attention">
            <div className="atlas-apps-attention-heading"><h2><Icon name="inbox" /> Besoin de vous</h2><span>À venir</span></div>
            <div className="atlas-apps-attention-empty"><span><Icon name="inbox" /></span><strong>Aucune demande affichée</strong>
              <p>Les validations et demandes d'accès apparaîtront ici lorsque les intégrations seront actives.</p>
              <Link href="/inbox">Voir l'Inbox <Icon name="arrow-right" /></Link></div>
          </section>
          <div className="atlas-apps-disclaimer">Les logos et marques appartiennent à leurs propriétaires. L'affichage dans le catalogue ne signifie pas qu'un connecteur est opérationnel.</div>
        </aside>
      </div>
    </>
  );
}
