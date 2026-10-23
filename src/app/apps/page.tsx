import { AppShell } from "@/components/app-shell";
import { Icon } from "@/components/icon";
import { AppsDirectory } from "@/components/apps-directory";
import { GitHubWorkspacePicker } from "@/components/github-connection";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { githubConnectSettings } from "@/lib/github/connect";

export const dynamic = "force-dynamic";

export default async function AppsPage({ searchParams }: { searchParams: Promise<{ github?: string }> }) {
  const { github } = await searchParams;
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = supabase ? await supabase.auth.getUser() : { data: { user: null } };
  const { data: memberships } = user && supabase
    ? await supabase.from("workspace_members")
      .select("workspace_id, role, workspaces!inner(name)")
      .eq("user_id", user.id).order("created_at", { ascending: true })
    : { data: null };
  const workspaces = (memberships ?? []).flatMap((item) => {
    const space = Array.isArray(item.workspaces) ? item.workspaces[0] : item.workspaces;
    if (!space || !["owner", "admin", "member"].includes(item.role)) return [];
    return [{ id: item.workspace_id, name: space.name,
      role: item.role as "owner" | "admin" | "member" }];
  });
  const workspaceIds = workspaces.map((workspace) => workspace.id);
  const { data: githubInstallations } = supabase && workspaceIds.length
    ? await supabase.from("atlas_github_installations").select("installation_id")
      .in("workspace_id", workspaceIds).eq("status", "repositories-ready").limit(1)
    : { data: null };
  const hasVerifiedGitHub = Boolean(githubInstallations?.length);
  const githubConfigured = Boolean(githubConnectSettings());
  return (
    <AppShell>
      <main className="main-content atlas-apps-page atlas-apps-v2" id="main-content">
        <header className="atlas-apps-intro atlas-apps-v2-intro">
          <div>
            <p className="atlas-overline">MES APPLICATIONS</p>
            <h1>Vos applications, au même endroit <span aria-hidden="true">✦</span></h1>
            <p>Reliez bientôt vos outils, vos agents IA et vos missions dans un seul espace. En attendant, explorez les intégrations.</p>
          </div>
          <a className="atlas-apps-explore-cta" href="#apps-catalog"><Icon name="apps" /> Explorer les apps <Icon name="arrow-right" /></a>
        </header>
        {github === "connected" ? <p role="status" className="atlas-github-result">Installation GitHub vérifiée. Consultez les dépôts autorisés ci-dessous.</p> :
          github ? <p role="alert" className="atlas-github-result">La connexion GitHub n&apos;a pas abouti. Vérifiez votre sélection et réessayez.</p> : null}
        <AppsDirectory githubConfigured={githubConfigured} hasVerifiedGitHub={hasVerifiedGitHub}
          githubSlot={<section id="atlas-github-connection" className="atlas-github-panel" aria-label="Intégration GitHub">
            <GitHubWorkspacePicker workspaces={workspaces} isConfigured={githubConfigured}/>
          </section>}/>
      </main>
    </AppShell>
  );
}
