import { AppShell } from "@/components/app-shell";
import { PageHeading } from "@/components/page-elements";
import { GitHubWorkspacePicker } from "@/components/github-connection";
import { Icon } from "@/components/icon";
import { demoApps } from "@/lib/demo-data";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { githubConnectSettings } from "@/lib/github/connect";

export const dynamic = "force-dynamic";

export default async function AppsPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = supabase ? await supabase.auth.getUser() : { data: { user: null } };
  const { data: memberships } = user && supabase
    ? await supabase.from("workspace_members").select("workspace_id, role, workspaces!inner(name)")
      .eq("user_id", user.id).order("created_at", { ascending: true })
    : { data: null };
  const workspaces = (memberships ?? []).flatMap((item) => {
    const space = Array.isArray(item.workspaces) ? item.workspaces[0] : item.workspaces;
    if (!space || !["owner", "admin", "member"].includes(item.role)) return [];
    return [{ id: item.workspace_id, name: space.name,
      role: item.role as "owner" | "admin" | "member" }];
  });
  const isConfigured = Boolean(githubConnectSettings());
  return <AppShell><main className="main-content" id="main-content">
    <PageHeading eyebrow="INTÉGRATIONS ATLAS" title="Mes Apps"
      description="Connectez des applications et consultez les ressources réellement autorisées."/>
    <GitHubWorkspacePicker workspaces={workspaces} isConfigured={isConfigured}/>
    <section className="apps-grid" aria-label="Autres applications">
      {demoApps.filter((app) => app.name !== "GitHub").map((app) =>
        <article className="app-card" key={app.name}>
          <div className={`space-mark ${app.tone}`} aria-hidden="true">{app.mark}</div>
          <div className="app-card-copy"><h2>{app.name}</h2><p>{app.description}</p></div>
          <span className="connection-pill">Non connecté</span>
          <button className="app-action" type="button" disabled
            aria-label={`${app.name} : connexion bientôt disponible`}>
            <Icon name="arrow-up-right"/><span>Bientôt</span>
          </button>
        </article>)}
    </section>
    <p className="section-footnote">Les autres connecteurs sont encore en préparation. GitHub ne sera indiqué comme utilisable qu&apos;après une vérification effective de l&apos;installation.</p>
  </main></AppShell>;
}
