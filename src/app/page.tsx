import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { Icon } from "@/components/icon";
import { ChiefComposer } from "@/components/chief-composer";
import { BrandLogo } from "@/components/brand-logo";
import { atlasApps } from "@/lib/app-catalog";

const summaries = [
  { label: "Approbations", value: "À activer", note: "Décisions et autorisations", icon: "inbox" as const, href: "/inbox", tone: "rose" },
  { label: "Agents IA", value: "À connecter", note: "Assistants et équipes", icon: "bot" as const, href: "/agents", tone: "violet" },
  { label: "Missions", value: "À connecter", note: "Suivi des tâches", icon: "activity" as const, href: "/missions", tone: "blue" },
];

const suggestedApps = atlasApps.slice(0, 3);

export default function Home() {
  return (
    <AppShell>
      <main className="main-content atlas-home" id="main-content">
        <div className="atlas-home-heading">
          <div>
            <p className="atlas-overline">VOTRE ESPACE ATLAS</p>
            <h1>Tout ce qui compte, au même endroit<span className="atlas-heading-spark" aria-hidden="true"> ✦</span></h1>
            <p className="atlas-home-lead">Vos agents IA, applications et missions, coordonnés en un seul espace.</p>
          </div>
          <Link className="atlas-primary-action" href="/apps"><Icon name="link" /> Explorer les apps</Link>
        </div>

        <section className="atlas-summary-grid" aria-label="Vue rapide">
          {summaries.map((item) => (
            <Link key={item.href} href={item.href} className="atlas-summary-card">
              <span className={"atlas-summary-icon atlas-icon-" + item.tone}><Icon name={item.icon} /></span>
              <span className="atlas-summary-copy"><span className="atlas-summary-label">{item.label}</span><strong>{item.value}</strong><small>{item.note}</small></span>
              <Icon name="arrow-up-right" className="atlas-summary-arrow" />
            </Link>
          ))}
        </section>

        <div className="atlas-home-primary">
          <section className="atlas-panel atlas-attention-panel" aria-labelledby="atlas-attention-heading">
            <div className="atlas-panel-heading">
              <div className="atlas-panel-heading-title"><span className="atlas-heading-icon atlas-icon-rose"><Icon name="inbox" /></span><h2 id="atlas-attention-heading">Besoin de vous</h2></div>
              <Link className="atlas-subtle-link" href="/inbox">Tout voir <Icon name="arrow-right" /></Link>
            </div>
            <div className="atlas-attention-empty">
              <span className="atlas-empty-symbol"><Icon name="inbox" /></span>
              <strong>Vos approbations arriveront ici.</strong>
              <p>Accès demandés, validations et décisions des agents : rien ne sera approuvé sans votre action.</p>
            </div>
            <div className="atlas-panel-footer"><span className="atlas-footnote-dot" /> Aucune source d’approbation connectée <Link href="/apps">Connecter <Icon name="arrow-right" /></Link></div>
          </section>

          <ChiefComposer />
        </div>

        <div className="atlas-home-secondary">
          <section className="atlas-panel atlas-agents-panel" aria-labelledby="atlas-agents-heading">
            <div className="atlas-panel-heading">
              <div className="atlas-panel-heading-title"><span className="atlas-heading-icon atlas-icon-violet"><Icon name="bot" /></span><h2 id="atlas-agents-heading">Agents & nouveautés</h2></div>
              <Link className="atlas-subtle-link" href="/agents">Voir les agents <Icon name="arrow-right" /></Link>
            </div>
            <div className="atlas-list-empty"><span className="atlas-list-empty-dot" /><div><strong>En attente de votre premier agent</strong><p>Connectez Hermes, un chatbot ou un autre agent pour suivre ses demandes et son activité.</p></div></div>
          </section>

          <section className="atlas-panel atlas-apps-panel" aria-labelledby="atlas-apps-heading">
            <div className="atlas-panel-heading">
              <div className="atlas-panel-heading-title"><span className="atlas-heading-icon atlas-icon-blue"><Icon name="apps" /></span><h2 id="atlas-apps-heading">Mes applications</h2></div>
              <Link className="atlas-subtle-link" href="/apps">Catalogue <Icon name="arrow-right" /></Link>
            </div>
            <p className="atlas-apps-caption">Suggestions d’intégrations · Aucune app connectée</p>
            <div className="atlas-suggested-apps">
              {suggestedApps.map((app) => (
                <Link href="/apps" key={app.name} className="atlas-mini-app">
                  <span className="atlas-mini-app-icon"><BrandLogo slug={app.slug} size={22} /></span><span>{app.name}</span><Icon name="arrow-up-right" />
                </Link>
              ))}
            </div>
          </section>
        </div>
        <p className="atlas-home-footer">Atlas affiche les données réelles uniquement après connexion de vos services.</p>
      </main>
    </AppShell>
  );
}
