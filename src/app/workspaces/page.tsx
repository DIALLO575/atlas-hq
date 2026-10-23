import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { Icon } from "@/components/icon";
import { listWorkspaces } from "@/app/workspaces/actions";
import { WorkspacesDashboard } from "@/components/workspaces-dashboard";

export const dynamic = "force-dynamic";

export default async function WorkspacesPage({
  searchParams,
}: {
  searchParams: Promise<{ createError?: string }>;
}) {
  const [result, params] = await Promise.all([listWorkspaces(), searchParams]);
  return (
    <AppShell>
      <main className="main-content atlas-workspaces-page" id="main-content">
        <header className="atlas-workspaces-hero">
          <div className="atlas-workspaces-hero-copy">
            <p className="atlas-overline">ORGANISATION ATLAS</p>
            <h1>Vos espaces de travail <span aria-hidden="true">✦</span></h1>
            <p>Retrouvez vos équipes et vos projets dans des espaces séparés, avec des accès adaptés à chaque membre.</p>
          </div>
          {result.status === "ready" && (
            <a href="#create-workspace" className="atlas-workspaces-primary">
              <Icon name="layers" /> Créer un workspace <Icon name="arrow-right" />
            </a>
          )}
        </header>

        {result.status === "ready" ? (
          <WorkspacesDashboard workspaces={result.workspaces} createError={params.createError === "1"} />
        ) : (
          <section className="atlas-workspaces-error" role="alert">
            <span className="atlas-workspaces-error-icon"><Icon name="layers" /></span>
            <div>
              <h2>Impossible d’afficher vos workspaces</h2>
              <p>{result.message}</p>
              <Link href="/workspaces">Réessayer <Icon name="arrow-right" /></Link>
            </div>
          </section>
        )}
      </main>
    </AppShell>
  );
}
