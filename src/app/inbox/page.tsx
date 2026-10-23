import { AppShell } from "@/components/app-shell";
import { DemoNotice, EmptyPanel, PageHeading } from "@/components/page-elements";

export default function InboxPage() {
  return <AppShell><main className="main-content" id="main-content"><PageHeading eyebrow="CENTRE DE SUIVI" title="Inbox" description="Les éléments qui demandent votre attention seront regroupés ici."/><DemoNotice/><EmptyPanel title="Votre Inbox est vide">Connectez vos outils pour faire apparaître ici les éléments à traiter.</EmptyPanel><p className="section-footnote">Aucun message, événement ou élément de suivi n’est importé.</p></main></AppShell>;
}
