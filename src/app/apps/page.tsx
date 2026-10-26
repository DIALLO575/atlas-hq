import { AppShell } from "@/components/app-shell";
import { AppsDirectory } from "@/components/apps-directory";
import { listConnectedApps } from "@/lib/connected-apps";
import "./connected-apps.css";

export const dynamic = "force-dynamic";

export default async function AppsPage() {
  const { apps, unavailable, unauthenticated } = await listConnectedApps();

  return (
    <AppShell>
      <main className="main-content atlas-apps-connected-page" id="main-content">
        <header className="atlas-connected-intro">
          <p className="atlas-overline">MES APPLICATIONS</p>
          <h1>Mes apps connectées</h1>
          <p>Un accès direct à vos outils reliés à Atlas, sans catalogue ni applications de démonstration.</p>
        </header>
        <AppsDirectory apps={apps} unavailable={unavailable} unauthenticated={unauthenticated} />
      </main>
    </AppShell>
  );
}
