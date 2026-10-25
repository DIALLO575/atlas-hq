import Link from "next/link";
import { NotionResourcesClient } from "@/components/notion-resources-client";
import { AppShell } from "@/components/app-shell";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { notionConnectSettings, notionTokenVault } from "@/lib/notion/connect";
import "./notion-console.css";

export const dynamic = "force-dynamic";
const feedback: Record<string,string> = {
  connected: "Connexion enregistrée. Vérifiez les ressources pour confirmer les droits réels chez Notion.",
  "invalid-state": "Cette tentative OAuth a expiré ou n'est pas valide.",
  denied: "Autorisation Notion annulée.",
  unavailable: "Connexion non confirmée. Aucun accès Notion n'est présumé.",
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
  const ready = (connections ?? []).filter(c =>
    c.status === "connected" && typeof c.workspace_id === "string" &&
    workspaces.some(w => w.id === c.workspace_id && ["owner","admin"].includes(w.role)));
  const authorized = ready.map(c => ({
    id: c.id, workspaceId: c.workspace_id as string,
    label: c.account_label || "Espace Notion",
  }));
  return <AppShell><main className="main-content nt-page" id="main-content">
    <nav className="atlas-gh-crumbs" aria-label="Fil d’Ariane">
      <Link href="/apps">Mes Apps</Link><span aria-hidden="true">/</span>
      <strong>Notion</strong>
    </nav>
    <header className="nt-hero">
      <div className="nt-hero-mark" aria-hidden="true">N</div>
      <div className="nt-hero-copy">
        <span className="nt-kicker">MES APPS / CENTRE DE CONTRÔLE</span>
        <h1>Notion, sous contrôle.</h1>
        <p>Retrouvez vos ressources et vos vraies vues Notion depuis ATLAS.
          Consultez les aperçus, vérifiez les accès et ouvrez les vues originales —
          sans recopier vos bases de données.</p>
        <div className="nt-hero-tags"><span>Vues natives</span><span>Lecture seule</span>
          <span>Permissions par ressource</span></div>
      </div>
      <div className="nt-hero-badge"><span className="nt-hero-dot"/>
        {authorized.length > 0 ? "Connexion ATLAS enregistrée" : "Aucun accès fournisseur confirmé"}</div>
    </header>
    {params.notion && feedback[params.notion] &&
      <p className="nt-banner" role="status">{feedback[params.notion]}</p>}
    {membershipError && <p className="nt-banner" role="alert">Impossible de lire vos workspaces ATLAS.</p>}
    {connectionsError && <p className="nt-banner" role="alert">Le statut des connexions ne peut pas être vérifié.</p>}
    <section className="nt-summary" aria-label="État de l’intégration">
      <div><span className="nt-kicker">CONNEXIONS ENREGISTRÉES</span>
        <strong>{authorized.length}</strong><p>L'accès réel reste à vérifier.</p></div>
      <div><span className="nt-kicker">VUES ET APERÇUS</span>
        <strong>À la demande</strong><p>Résultats Notion, sans import.</p></div>
      <div><span className="nt-kicker">MODE D'ACCÈS</span>
        <strong>REST · Lecture</strong><p>Pas d’écriture, webhook ou agent actif.</p></div>
    </section>
    {authorized.length > 0 ? <NotionResourcesClient connections={authorized}/> :
      <section className="nt-empty-hub" aria-label="Intégration en attente">
        <div className="nt-empty-art" aria-hidden="true"><span>N</span><i/><i/><i/></div>
        <div><span className="nt-kicker">APERÇU NON DISPONIBLE</span>
          <h2>Votre espace Notion apparaîtra ici.</h2>
          <p>Une fois l'OAuth REST activé et une connexion de test autorisée, ATLAS
            affichera uniquement les pages, bases et vues que Notion partage réellement
            avec cette connexion. Aucun jeu de données fictif n’est présenté.</p>
          <p className="nt-empty-note">{!configured
            ? "Configuration OAuth serveur désactivée ou incomplète."
            : "Aucune connexion Notion personnelle active pour cet espace ATLAS."}</p>
        </div>
      </section>}
    <section className="nt-setup" aria-label="Gestion des connexions Notion">
      <div><span className="nt-kicker">CONNEXIONS ET AUTORISATIONS</span>
        <h2>Gérer les espaces accessibles</h2>
        <p>Seuls les propriétaires et administrateurs ATLAS peuvent créer une connexion.
          Le partage des pages et bases se règle directement dans Notion.</p>
      </div>
      <div className="nt-workspaces">{workspaces.length === 0 ?
        <p>Aucun workspace ATLAS disponible pour ce compte.</p> :
        workspaces.map(workspace => <div className="nt-workspace" key={workspace.id}>
          <div className="nt-workspace-avatar" aria-hidden="true">{workspace.name.charAt(0)}</div>
          <div><strong>{workspace.name}</strong><small>Rôle : {workspace.role}</small></div>
          <form method="post" action="/api/apps/notion/connect/start">
            <input type="hidden" name="workspaceId" value={workspace.id}/>
            <button type="submit" className="nt-button nt-button-dark" disabled={
              !configured || !["owner","admin"].includes(workspace.role)
            }>Connecter ↗</button>
          </form>
        </div>)}
      </div>
    </section>
    <p className="nt-footer-note">Notion reste la source de vérité. ATLAS ne duplique
      ni les bases, ni les vues et ne lance aucun synchroniseur en arrière-plan.</p>
  </main></AppShell>;
}
