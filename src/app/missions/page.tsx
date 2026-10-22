import { AppShell } from "@/components/app-shell";
import { DemoNotice, EmptyPanel, PageHeading } from "@/components/page-elements";

export default function MissionsPage() {
  return <AppShell><main className="main-content" id="main-content"><PageHeading eyebrow="SUIVI DU TRAVAIL" title="Missions" description="Un point d’entrée pour suivre vos missions et leur avancement."/><DemoNotice/><EmptyPanel title="Aucune mission à afficher">Les missions apparaîtront ici lorsqu’une source de travail sera connectée.</EmptyPanel><p className="section-footnote">Aucune mission ni progression n’est simulée.</p></main></AppShell>;
}
