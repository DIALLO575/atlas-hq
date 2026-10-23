import { AppShell } from "@/components/app-shell";
import { DemoNotice, EmptyPanel, PageHeading } from "@/components/page-elements";

export default function SettingsPage() {
  return <AppShell><main className="main-content" id="main-content"><PageHeading eyebrow="ESPACE PERSONNEL" title="Paramètres" description="Les préférences d’ATLAS HQ seront réglables depuis cet espace."/><DemoNotice/><EmptyPanel title="Paramètres indisponibles">Aucun réglage n’est enregistré pour le moment. Les préférences de compte et d’affichage seront ajoutées dans une étape dédiée.</EmptyPanel></main></AppShell>;
}
