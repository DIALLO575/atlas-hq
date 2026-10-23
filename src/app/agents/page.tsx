import { AppShell } from "@/components/app-shell";
import { DemoNotice, EmptyPanel, PageHeading } from "@/components/page-elements";

export default function AgentsPage() {
  return <AppShell><main className="main-content" id="main-content"><PageHeading eyebrow="ESPACE DE TRAVAIL" title="Agents & Équipes" description="Retrouvez ici les assistants et les équipes de votre espace."/><DemoNotice/><EmptyPanel title="Aucun agent connecté">Les agents apparaîtront ici après la connexion d’OpenMausBot. Le cockpit reste utilisable sans assistant.</EmptyPanel><p className="section-footnote">Aucune conversation ni activité d’agent n’est simulée.</p></main></AppShell>;
}
