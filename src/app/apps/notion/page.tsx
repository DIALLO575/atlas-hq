import Link from "next/link";
import { NotionResourcesClient } from "@/components/notion-resources-client";
import { AppShell } from "@/components/app-shell";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { notionConnectSettings, notionTokenVault } from "@/lib/notion/connect";

export const dynamic = "force-dynamic";
const feedback: Record<string,string> = {
  connected: "Notion a confirmé la connexion et ATLAS a enregistré les identifiants chiffrés.",
  "invalid-state": "La tentative de connexion est invalide ou a expiré.",
  denied: "L'autorisation Notion a été annulée.",
  unavailable: "La connexion n'a pas pu être finalisée. Aucune connexion n'est présumée.",
};
export default async function NotionPage({
  searchParams,
}: { searchParams: Promise<{ notion?: string }> }) {
  const params = await searchParams;
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = supabase
    ? await supabase.auth.getUser() : { data: { user: null } };
  const { data: memberships, error: membershipError } = user && supabase
    ? await supabase.from("workspace_members")
      .select("workspace_id,role,workspaces!inner(name)")
      .eq("user_id", user.id).order("created_at", { ascending: true })
    : { data: null, error: null };
  const workspaces = (memberships ?? []).flatMap(item => {
    const w = Array.isArray(item.workspaces) ? item.workspaces[0] : item.workspaces;
    if (!w || !["owner","admin","member"].includes(item.role)) return [];
    return [{ id: item.workspace_id, name: w.name, role: item.role }];
  });
  const settings = notionConnectSettings();
  const configured = Boolean(settings?.callbackEnabled && notionTokenVault());
  const { data: connections, error: connectionsError } = configured && user && supabase
    ? await supabase.from("atlas_connections")
      .select("id,account_label,status,workspace_id")
      .eq("owner_id", user.id).eq("provider", "notion")
      .order("created_at", { ascending: false })
    : { data: null, error: null };

  return <AppShell><main className="main-content atlas-github-page" id="main-content">
    <nav className="atlas-gh-crumbs" aria-label="Fil d’Ariane">
      <Link href="/apps">Mes Apps</Link><span aria-hidden="true">/</span>
      <strong>Notion</strong>
    </nav>
    <header><p className="atlas-overline">MES APPLICATIONS</p>
      <h1>Notion Control Center</h1>
      <p>Connectez vos espaces Notion à ATLAS. Les autorisations restent personnelles,
        limitées aux pages choisies dans Notion et à votre workspace ATLAS.</p>
    </header>
    {params.notion && feedback[params.notion] &&
      <p role="status">{feedback[params.notion]}</p>}
    {!configured &&
      <section aria-label="Configuration Notion">
        <h2>Connexion non activée</h2>
        <p>L&apos;intégration OAuth Notion nécessite encore sa configuration sécurisée
          et la validation des migrations sur un environnement de test.
          Aucune connexion Notion n&apos;est supposée active.</p>
      </section>}
    {membershipError && <p role="alert">Les workspaces ATLAS sont momentanément indisponibles.</p>}
    {configured && connectionsError && <p role="alert">
      Le statut des connexions Notion ne peut pas être vérifié actuellement.
    </p>}
    {configured && (connections ?? []).length > 0 &&
      <section aria-label="Connexions enregistrées">
        <h2>Connexions personnelles</h2>
        <ul>{(connections ?? []).map(c =>
          <li key={c.id}>
            <strong>{c.account_label}</strong> — {c.status === "connected"
              ? "Identifiants enregistrés, accès fournisseur à vérifier"
              : "Déconnectée"}
            {c.status === "connected" && typeof c.workspace_id === "string" &&
              <NotionResourcesClient workspaceId={c.workspace_id} connectionId={c.id}/>}
          </li>)}</ul>
      </section>}
    <section aria-label="Connecter Notion">
      <h2>Espaces de travail ATLAS</h2>
      {workspaces.length === 0 ? <p>Aucun espace ATLAS disponible pour ce compte.</p> :
        <ul>{workspaces.map(workspace =>
          <li key={workspace.id}>
            <strong>{workspace.name}</strong> — {workspace.role}
            <form method="post" action="/api/apps/notion/connect/start">
              <input type="hidden" name="workspaceId" value={workspace.id} />
              <button type="submit" disabled={!configured ||
                !["owner","admin"].includes(workspace.role)}>Connecter Notion</button>
            </form>
          </li>)}</ul>}
    </section>
    <p>Les pages partagées peuvent être consultées en lecture seule après une connexion vérifiée.
      Les écritures, agents MCP et synchronisation restent désactivés.</p>
  </main></AppShell>;
}
