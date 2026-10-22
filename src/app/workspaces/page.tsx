import { AppShell } from "@/components/app-shell";
import { DemoNotice, EmptyPanel, PageHeading } from "@/components/page-elements";

export default function WorkspacesPage() {
  return <AppShell><main className="main-content" id="main-content"><PageHeading eyebrow="ESPACE DE TRAVAIL" title="Workspaces" description="Retrouvez vos espaces de travail et leurs éléments liés au même endroit."/><DemoNotice/><EmptyPanel title="Aucun workspace connecté">Les espaces Notion et les autres espaces apparaîtront ici après la configuration des intégrations.</EmptyPanel><p className="section-footnote">Aucune source externe n’est connectée. Les espaces restent gérés dans leurs outils d’origine.</p></main></AppShell>;
}
