import { AppShell } from "@/components/app-shell";
import { requireUser } from "@/lib/auth";
import { DemoNotice, EmptyPanel, PageHeading } from "@/components/page-elements";

export const dynamic = "force-dynamic";

export default async function AgentsPage() {
  await requireUser();
  return <AppShell><main className="main-content" id="main-content"><PageHeading eyebrow="ESPACE DE TRAVAIL" title="Agents" description="Retrouvez ici les assistants et leurs espaces de travail."/><DemoNotice/><EmptyPanel title="Aucun agent connecté">Les agents apparaîtront ici après la connexion d’OpenMausBot. Le cockpit reste utilisable sans assistant.</EmptyPanel><p className="section-footnote">Aucune conversation ni activité d’agent n’est simulée.</p></main></AppShell>;
}
