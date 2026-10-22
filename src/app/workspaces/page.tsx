import { AppShell } from "@/components/app-shell";
import { DemoNotice, EmptyPanel, PageHeading } from "@/components/page-elements";

export default function WorkspacesPage() {
  return <AppShell><main className="main-content" id="main-content"><PageHeading eyebrow="ESPACE DE TRAVAIL" title="Workspaces" description="Retrouvez vos espaces de travail et leurs éléments liés au même endroit."/><DemoNotice/><EmptyPanel title="Contrat workspace indisponible">Le schéma backend vérifié ne fournit pas encore de liste ni d’appartenance workspace. Cette vue s’activera quand le contrat sera disponible.</EmptyPanel><p className="section-footnote">Aucun workspace n’est inventé ou sélectionné à votre place.</p></main></AppShell>;
}
