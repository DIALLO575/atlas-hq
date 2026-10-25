import "./agent-request.css";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { AgentRequestForm } from "@/components/agent-request-form";
import { N8nCoordinationPanel } from "@/components/n8n-coordination-panel";
import { readAtlasWorkflow } from "@/lib/atlas-workflow";
import { PageHeading } from "@/components/page-elements";

export const dynamic = "force-dynamic";

export default async function AgentsPage({
  searchParams,
}: { searchParams: Promise<{ workspaceId?: string }> }) {
  const params = await searchParams;
  const data = await readAtlasWorkflow(params.workspaceId);
  return <AppShell><main className="main-content" id="main-content">
    <PageHeading eyebrow="ESPACE DE TRAVAIL" title="Agents & Équipes"
      description="Inventaire live des bots, groupes et modèles d’équipe MAUSBOT, avec demandes de création soumises à revue ATLAS." />
    <AgentRequestForm />
    {data.status === "error" ? <p role="alert">{data.message}</p> : data.selected ? <>
      <nav aria-label="Workspace des agents" className="atlas-flow-workspace-options">
        {data.spaces.map(space => <Link key={space.id}
          href={"/agents?workspaceId=" + encodeURIComponent(space.id)}
          aria-current={space.id === data.selected?.id ? "page" : undefined}>{space.name}</Link>)}
      </nav>
      <N8nCoordinationPanel workspaceId={data.selected.id} scope="agents" />
      <p className="section-footnote">Liaisons Agents ↔ Moteurs à certifier : ce registre d’automatisations ne crée aucun agent et n’accorde aucune permission d’exécution.</p>
    </> : <p>Aucun registre d’automatisations n8n disponible pour ce workspace.</p>
    <p className="section-footnote"><Link href="/engines">Ouvrir Moteurs IA pour consulter l’état de connexion →</Link></p>
  </main></AppShell>;
}
