import { AppShell } from "@/components/app-shell";
import { EmptyPanel, PageHeading } from "@/components/page-elements";
import { listWorkspaces } from "@/app/workspaces/actions";

export default async function WorkspacesPage() {
  const result = await listWorkspaces();
  return <AppShell><main className="main-content" id="main-content"><PageHeading eyebrow="ESPACE DE TRAVAIL" title="Workspaces" description="Vos espaces sont filtrés côté serveur selon votre appartenance vérifiée."/>
    {result.status === "ready" && result.workspaces.length > 0 ? <section className="spaces-grid" aria-label="Vos workspaces">{result.workspaces.map((workspace) => <article className="space-card" key={workspace.id}><h2>{workspace.name}</h2><p>Rôle : {workspace.role}</p></article>)}</section> : <EmptyPanel title={result.status === "ready" ? "Aucun workspace attribué" : "Workspaces indisponibles"}>{result.status === "ready" ? "Un workspace apparaîtra ici après votre ajout par un administrateur." : result.message}</EmptyPanel>}
  </main></AppShell>;
}
