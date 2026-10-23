import { AppShell } from "@/components/app-shell";
import { requireUser } from "@/lib/auth";
import { DemoNotice, PageHeading } from "@/components/page-elements";
import { demoApps } from "@/lib/demo-data";
import { Icon } from "@/components/icon";

export const dynamic = "force-dynamic";

export default async function AppsPage() {
  await requireUser();
  return <AppShell><main className="main-content" id="main-content"><PageHeading eyebrow="VOTRE ÉCOSYSTÈME" title="Mes Apps" description="Retrouvez vos outils au même endroit et consultez leur état de connexion."/><DemoNotice/><section className="apps-grid" aria-label="Catalogue des applications">
    {demoApps.map((app) => <article className="app-card" key={app.name}><div className={`space-mark ${app.tone}`} aria-hidden="true">{app.mark}</div><div className="app-card-copy"><h2>{app.name}</h2><p>{app.description}</p></div><span className="connection-pill"><span aria-hidden="true"/>Non connecté</span><button className="app-action" type="button" disabled aria-label={`${app.name} : connexion bientôt disponible`}><Icon name="arrow-up-right"/><span>Bientôt</span></button></article>)}
  </section><p className="section-footnote">Le catalogue présente des exemples. Les connexions seront proposées après la mise en place des intégrations.</p></main></AppShell>;
}
