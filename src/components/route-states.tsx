"use client";

import { AppShell } from "@/components/app-shell";
import { PageHeading } from "@/components/page-elements";

export function LoadingState({ label }: { label: string }) {
  return <AppShell><main className="main-content" id="main-content" aria-busy="true"><PageHeading eyebrow="CHARGEMENT" title={label} description="Préparation de cet espace…"/><div className="loading-card" role="status"><span className="loading-spinner" aria-hidden="true"/>Chargement en cours…</div></main></AppShell>;
}

export function ErrorState({ reset }: { reset: () => void }) {
  return <AppShell><main className="main-content" id="main-content"><PageHeading eyebrow="UN INSTANT" title="Cette vue n’a pas pu s’afficher" description="Une erreur inattendue a interrompu l’affichage de cette page."/><section className="error-card" role="alert"><p>Réessayez. Si le problème persiste, revenez à la vue d’ensemble.</p><button className="button button-light retry-button" onClick={reset}>Réessayer</button></section></main></AppShell>;
}
