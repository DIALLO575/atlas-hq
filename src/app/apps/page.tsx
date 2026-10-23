import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { Icon } from "@/components/icon";
import { AppsDirectory } from "@/components/apps-directory";

export default function AppsPage() {
  return (
    <AppShell>
      <main className="main-content atlas-apps-page" id="main-content">
        <header className="atlas-apps-intro">
          <div>
            <p className="atlas-overline">INTÉGRATIONS ATLAS</p>
            <h1>Mes Apps</h1>
            <p>Vos outils, prêts à travailler avec vos agents IA.</p>
          </div>
          <Link className="atlas-apps-agents-link" href="/agents">
            <Icon name="bot" /> Mes agents <Icon name="arrow-right" />
          </Link>
        </header>
        <AppsDirectory />
      </main>
    </AppShell>
  );
}
