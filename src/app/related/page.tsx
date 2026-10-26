import { AppShell } from "@/components/app-shell";
import { EmptyPanel, PageHeading } from "@/components/page-elements";

export default function RelatedPage() {
  return <AppShell><main className="main-content" id="main-content"><PageHeading eyebrow="ACCÈS TRANSVERSAL" title="Éléments liés" description="Les liens entre espaces, missions et applications seront visibles ici."/><EmptyPanel title="Aucun élément lié">Les relations seront affichées après la connexion de sources de données. Aucun lien n’est déduit ou inventé.</EmptyPanel></main></AppShell>;
}
