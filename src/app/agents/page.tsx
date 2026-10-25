import "./agent-request.css";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { AgentRequestForm } from "@/components/agent-request-form";
import { PageHeading } from "@/components/page-elements";

export default function AgentsPage() {
  return <AppShell><main className="main-content" id="main-content">
    <PageHeading eyebrow="ESPACE DE TRAVAIL" title="Agents & Équipes"
      description="Inventaire live des bots, groupes et modèles d’équipe MAUSBOT, avec demandes de création soumises à revue ATLAS." />
    <AgentRequestForm />
    <p className="section-footnote"><Link href="/engines">Ouvrir Moteurs IA pour consulter l’état de connexion →</Link></p>
  </main></AppShell>;
}
