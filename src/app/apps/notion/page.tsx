import Link from "next/link";
import { NotionResourcesClient } from "@/components/notion-resources-client";
import { AppShell } from "@/components/app-shell";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { notionConnectSettings, notionTokenVault } from "@/lib/notion/connect";
import "./notion-console.css";
import "./notion-mobile-workspace.css";
import "./notion-minimal.css";

export const dynamic = "force-dynamic";
const feedback: Record<string,string> = {
  connected: "Notion connecté.",
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
    <nav className="nt-phone-appbar" aria-label="Navigation Notion">
      <Link href="/apps" className="nt-phone-atlas-back"
        aria-label="Retour à Mes Apps ATLAS">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>
      </Link>
      <span className="nt-phone-brand-mark" aria-hidden="true">N</span>
      <div className="nt-phone-app-name"><strong>Notion</strong>
        <small>Lecture seule</small></div>
      <a className="nt-phone-app-settings" href="#notion-connections">
        Connexion
      </a>
    </nav>
    <nav className="atlas-gh-crumbs" aria-label="Fil d’Ariane">
      <Link href="/apps">Mes Apps</Link><span aria-hidden="true">/</span>
      <strong>Notion</strong>
    </nav>
    <header className="nt-workspace-header">
      <div className="nt-wordmark"><span aria-hidden="true">N</span><h1>Notion</h1></div>
      <a className="nt-button nt-button-quiet" href="#notion-connections">Connexions</a>
    </header>
    {params.notion && feedback[params.notion] &&
      <p className="nt-banner" role="status">{feedback[params.notion]}</p>}
    {membershipError && <p className="nt-banner" role="alert">Impossible de lire vos workspaces ATLAS.</p>}
    {connectionsError && <p className="nt-banner" role="alert">Le statut des connexions ne peut pas être vérifié.</p>}
    {authorized.length > 0 ? <NotionResourcesClient connections={authorized}/> :
      <section className="nt-empty-hub" aria-label="Intégration en attente">
        <div><h2>Votre espace Notion</h2>
          <p>Connectez Notion pour retrouver vos pages et vos bases.</p>
          <a href="#notion-connections" className="nt-button nt-button-dark">Connecter Notion ↗</a>
          {!configured && <p className="nt-empty-note">Connexion momentanément indisponible.</p>}
        </div>
      </section>}
    <details id="notion-connections" className="nt-connection-settings">
      <summary>Connexions et accès</summary>
      <div className="nt-setup">
      <div><h2>Espaces connectés</h2><p>Gérez ici vos connexions Notion.</p></div>
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
      </div>
    </details>
  </main></AppShell>;
}
