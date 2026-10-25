import "./agent-request.css";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { AgentRequestForm } from "@/components/agent-request-form";
import { PageHeading, EmptyPanel } from "@/components/page-elements";

export default function AgentsPage() {
  return <AppShell><main className="main-content" id="main-content">
    <PageHeading eyebrow="ESPACE DE TRAVAIL" title="Agents & Équipes"
      description="Les agents seront ici regroupés par workspace et par moteur, indépendamment de leur fournisseur." />
    <AgentRequestForm />
    <EmptyPanel title="Le registre des agents ATLAS est en préparation">
      L’inventaire des agents sera disponible après connexion et validation du moteur.
      Aucune équipe ni conversation n’est simulée.
    </EmptyPanel>
    <p className="section-footnote"><Link href="/engines">Ouvrir Moteurs IA pour consulter l’état de connexion →</Link></p>
  </main></AppShell>;
}
