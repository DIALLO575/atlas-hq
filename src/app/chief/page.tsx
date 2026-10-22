import { AppShell } from "@/components/app-shell";
import { DemoNotice, EmptyPanel, PageHeading } from "@/components/page-elements";

export default function ChiefPage() {
  return <AppShell><main className="main-content" id="main-content"><PageHeading eyebrow="ACCÈS TRANSVERSAL" title="Chief" description="Point d’accès au Chief depuis ATLAS HQ."/><DemoNotice/><EmptyPanel title="Chief n’est pas connecté" icon="bot">La connexion OpenMausBot n’est pas active. Les demandes au Chief ne sont pas envoyées depuis cette interface.</EmptyPanel></main></AppShell>;
}
