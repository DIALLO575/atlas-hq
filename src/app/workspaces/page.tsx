import { AppShell } from "@/components/app-shell";
import { EmptyPanel, PageHeading } from "@/components/page-elements";
import { createWorkspaceFromForm, listWorkspaces } from "@/app/workspaces/actions";

export default async function WorkspacesPage() {
  const result = await listWorkspaces();
  return <AppShell><main className="main-content" id="main-content"><PageHeading eyebrow="ESPACE DE TRAVAIL" title="Workspaces" description="Vos espaces sont filtrés côté serveur selon votre appartenance vérifiée."/>
    {result.status === "ready" && <section aria-labelledby="create-workspace-title">
      <h2 id="create-workspace-title">Créer un workspace</h2>
      <form action={createWorkspaceFromForm}>
        <label htmlFor="new-workspace-name">Nom du workspace</label>
        <input id="new-workspace-name" name="name" required minLength={1} maxLength={120} placeholder="ATLAS FORGE"/>
        <button type="submit">Créer le workspace</button>
      </form>
    </section>}
    {result.status === "ready" && result.workspaces.length > 0 ? <section className="spaces-grid" aria-label="Vos workspaces">{result.workspaces.map((workspace) => <article className="space-card" key={workspace.id}><h2>{workspace.name}</h2><p>Rôle : {workspace.role}</p></article>)}</section> : <EmptyPanel title={result.status === "ready" ? "Aucun workspace attribué" : "Workspaces indisponibles"}>{result.status === "ready" ? "Un workspace apparaîtra ici après votre ajout par un administrateur." : result.message}</EmptyPanel>}
  </main></AppShell>;
}
