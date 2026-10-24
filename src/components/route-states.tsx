"use client";

import { AppShell } from "@/components/app-shell";
import { PageHeading } from "@/components/page-elements";

export function LoadingState({ label }: { label: string }) {
  return (
    <AppShell>
      <main className="main-content atlas-route-skeleton" id="main-content" aria-busy="true">
        <header className="atlas-skeleton-heading">
          <div>
            <span className="atlas-skeleton-eyebrow">ATLAS / {label.toUpperCase()}</span>
            <h1>{label} <span aria-hidden="true">✦</span></h1>
            <p>Votre espace se prépare.</p>
          </div>
          <span className="atlas-skeleton-orbit" aria-hidden="true"><span /></span>
        </header>
        <div className="atlas-skeleton-status" role="status" aria-live="polite">
          <span className="atlas-skeleton-loader" aria-hidden="true"><i /><i /><i /></span>
          Ouverture de {label}…
        </div>
        <div className="atlas-skeleton-kpis" aria-hidden="true">
          {[0, 1, 2].map((item) => <div key={item} className="atlas-skeleton-kpi">
            <span className="atlas-skeleton-shape atlas-skeleton-square" />
            <div><span className="atlas-skeleton-shape atlas-skeleton-number" />
              <span className="atlas-skeleton-shape atlas-skeleton-caption" /></div>
          </div>)}
        </div>
        <section className="atlas-skeleton-layout" aria-hidden="true">
          <div className="atlas-skeleton-main">
            <div className="atlas-skeleton-toolbar">
              <span className="atlas-skeleton-shape atlas-skeleton-heading-bar"/>
              <span className="atlas-skeleton-shape atlas-skeleton-search-bar"/>
            </div>
            <div className="atlas-skeleton-grid">
              {[0, 1, 2, 3].map((item) => <div className="atlas-skeleton-card" key={item}>
                <span className="atlas-skeleton-shape atlas-skeleton-square"/>
                <span className="atlas-skeleton-shape atlas-skeleton-title-bar"/>
                <span className="atlas-skeleton-shape atlas-skeleton-body-bar"/>
                <span className="atlas-skeleton-shape atlas-skeleton-footer-bar"/>
              </div>)}
            </div>
          </div>
          <div className="atlas-skeleton-aside">
            <span className="atlas-skeleton-shape atlas-skeleton-square"/>
            <span className="atlas-skeleton-shape atlas-skeleton-title-bar"/>
            <span className="atlas-skeleton-shape atlas-skeleton-body-bar"/>
            <span className="atlas-skeleton-shape atlas-skeleton-body-bar"/>
            <span className="atlas-skeleton-shape atlas-skeleton-footer-bar"/>
          </div>
        </section>
      </main>
    </AppShell>
  );
}

export function ErrorState({ reset }: { reset: () => void }) {
  return <AppShell><main className="main-content" id="main-content"><PageHeading eyebrow="UN INSTANT" title="Cette vue n’a pas pu s’afficher" description="Une erreur inattendue a interrompu l’affichage de cette page."/><section className="error-card" role="alert"><p>Réessayez. Si le problème persiste, revenez à la vue d’ensemble.</p><button className="button button-light retry-button" onClick={reset}>Réessayer</button></section></main></AppShell>;
}
