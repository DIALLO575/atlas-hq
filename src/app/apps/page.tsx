import { AppShell } from "@/components/app-shell";
import { Icon } from "@/components/icon";
import { AppsDirectory } from "@/components/apps-directory";
import { githubConnectSettings } from "@/lib/github/connect";

// The catalogue is static: reading session, workspace memberships and GitHub
// installations here used to delay every visit. Real connection state is
// fetched only inside the GitHub Control Center.
export default function AppsPage() {
  return (
    <AppShell>
      <main className="main-content atlas-apps-page atlas-apps-v2" id="main-content">
        <header className="atlas-apps-intro atlas-apps-v2-intro">
          <div>
            <p className="atlas-overline">MES APPLICATIONS</p>
            <h1>Vos applications, au même endroit <span aria-hidden="true">✦</span></h1>
            <p>Explorez les outils qui pourront accompagner vos agents IA et vos missions.</p>
          </div>
          <a className="atlas-apps-explore-cta" href="#apps-catalog"><Icon name="apps" /> Explorer les apps <Icon name="arrow-right" /></a>
        </header>
        <AppsDirectory githubConfigured={Boolean(githubConnectSettings())} />
      </main>
    </AppShell>
  );
}
