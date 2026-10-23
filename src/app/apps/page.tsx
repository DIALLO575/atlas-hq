import { AppShell } from "@/components/app-shell";
import { Icon } from "@/components/icon";
import { AppsDirectory } from "@/components/apps-directory";

export default function AppsPage() {
  return (
    <AppShell>
      <main className="main-content atlas-apps-page atlas-apps-v2" id="main-content">
        <header className="atlas-apps-intro atlas-apps-v2-intro">
          <div>
            <p className="atlas-overline">MES APPLICATIONS</p>
            <h1>Vos applications, au même endroit <span aria-hidden="true">✦</span></h1>
            <p>Reliez bientôt vos outils, vos agents IA et vos missions dans un seul espace. En attendant, explorez les intégrations.</p>
          </div>
          <a className="atlas-apps-explore-cta" href="#apps-catalog"><Icon name="apps" /> Explorer les apps <Icon name="arrow-right" /></a>
        </header>
        <AppsDirectory />
      </main>
    </AppShell>
  );
}
