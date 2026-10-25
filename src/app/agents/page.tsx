import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PageHeading, EmptyPanel } from "@/components/page-elements";
import { N8nCoordinationPanel } from "@/components/n8n-coordination-panel";
import { readAtlasWorkflow } from "@/lib/atlas-workflow";

export const dynamic = "force-dynamic";

export default async function AgentsPage({
  searchParams,
}: { searchParams: Promise<{ workspaceId?: string }> }) {
  const params=await searchParams;
  const data=await readAtlasWorkflow(params.workspaceId);
  return <AppShell><main className="main-content" id="main-content">
    <PageHeading eyebrow="ESPACE DE TRAVAIL" title="Agents & Équipes"
      description="Les workflows n8n sont des automatisations ; leur présence ne certifie pas un agent IA." />
    {data.status==="error"?
      <p role="alert">{data.message}</p>:
      !data.selected?
      <EmptyPanel title="Aucun workspace accessible">Créez un workspace Atlas pour consulter vos moteurs.</EmptyPanel>:
      <>
        <nav aria-label="Workspace des agents" className="atlas-flow-workspace-options">
          {data.spaces.map(space=><Link key={space.id}
            href={"/agents?workspaceId="+encodeURIComponent(space.id)}
            aria-current={space.id===data.selected?.id?"page":undefined}>{space.name}</Link>)}
        </nav>
        <N8nCoordinationPanel workspaceId={data.selected.id} scope="agents" />
      </>}
    <EmptyPanel title="Liaisons Agents ↔ Moteurs à certifier">
      Le registre des automatisations n8n ne certifie pas de liaison à un agent.
      Les vrais profils et équipes nécessitent des droits, des versions de moteur et une identité attestés.
    </EmptyPanel>
    <p className="section-footnote"><Link href="/engines">Ouvrir Moteurs IA pour consulter les instances enregistrées</Link></p>
  </main></AppShell>;
}
