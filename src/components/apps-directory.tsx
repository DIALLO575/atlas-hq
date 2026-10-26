import Link from "next/link";
import { BrandLogo } from "@/components/brand-logo";
import { Icon } from "@/components/icon";
import type { ConnectedApp } from "@/lib/connected-apps";

export function AppsDirectory({
  apps, unavailable, unauthenticated,
}: {
  apps: ConnectedApp[];
  unavailable: boolean;
  unauthenticated: boolean;
}) {
  return (
    <section className="atlas-connected-section" id="apps-connected" aria-labelledby="connected-apps-heading">
      <div className="atlas-connected-section-header">
        <div>
          <h2 id="connected-apps-heading">Vos connexions</h2>
          <p>Les applications réellement associées à vos workspaces.</p>
        </div>
        <span className="atlas-connected-count" role="status">
          {apps.length} app{apps.length > 1 ? "s" : ""}
        </span>
      </div>

      {unavailable && (
        <p className="atlas-connected-warning" role="alert">
          Certaines connexions n’ont pas pu être vérifiées. Seules celles confirmées sont affichées.
        </p>
      )}

      {apps.length > 0 ? (
        <div className="atlas-connected-grid">
          {apps.map((app) => (
            <article className="atlas-connected-card" key={app.slug}>
              <div className="atlas-connected-card-top">
                <span className="atlas-connected-brand"><BrandLogo slug={app.slug} size={38} /></span>
                <span className="atlas-connected-status"><i aria-hidden="true" /> Connectée</span>
              </div>
              <h3>{app.name}</h3>
              <p>{app.description}</p>
              <Link className="atlas-connected-open" href={app.href}>
                Ouvrir l’application <Icon name="arrow-up-right" />
              </Link>
            </article>
          ))}
        </div>
      ) : (
        <div className="atlas-connected-empty">
          <span className="atlas-connected-empty-icon"><Icon name="apps" /></span>
          <h3>{unauthenticated ? "Connexion nécessaire"
            : unavailable ? "Connexions indisponibles"
            : "Aucune application connectée"}</h3>
          <p>{unauthenticated ? "Connectez-vous à Atlas pour retrouver vos applications."
            : unavailable ? "La vérification est temporairement indisponible. Réessayez plus tard."
            : "Les applications apparaîtront ici une fois leur connexion terminée."}</p>
        </div>
      )}

      <p className="atlas-connected-footnote">
        Les connexions affichées proviennent des autorisations enregistrées pour vos workspaces.
        La disponibilité en temps réel se vérifie dans chaque application.
      </p>
    </section>
  );
}
