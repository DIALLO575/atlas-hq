import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PageHeading, EmptyPanel } from "@/components/page-elements";

export default function AgentsPage() {
  return <AppShell><main className="main-content" id="main-content">
    <PageHeading eyebrow="ESPACE DE TRAVAIL" title="Agents & Équipes"
      description="Les agents seront ici regroupés par workspace et par moteur, indépendamment de leur fournisseur." />
    <EmptyPanel title="Le registre des agents ATLAS est en préparation">
      Le premier inventaire réel des agents MAUSBOT est disponible dans l'Espace Moteurs.
      Aucune équipe ni conversation n'est simulée.
    </EmptyPanel>
    <p className="section-footnote"><Link href="/engines">Ouvrir Moteurs IA pour voir les bots connectés et lancer une mission →</Link></p>
  </main></AppShell>;
}
