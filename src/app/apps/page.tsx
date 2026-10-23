import Link from "next/link";
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
    const workspace = Array.isArray(item.workspaces) ? item.workspaces[0] : item.workspaces;
    if (!workspace || !["owner", "admin", "member"].includes(item.role)) return [];
    return [{ id: item.workspace_id, name: workspace.name,
      role: item.role as "owner" | "admin" | "member" }];
  });
  const workspaceIds = workspaces.map((workspace) => workspace.id);
  // This table is intentionally absent until the reviewed GitHub migration is applied.
  // Never treat the legacy owner-writable atlas_connections as verified auth evidence.
  const { data: githubInstallations } = supabase && workspaceIds.length
    ? await supabase.from("atlas_github_installations").select("installation_id")
      .in("workspace_id", workspaceIds).eq("status", "repositories-ready").limit(1)
    : { data: null };
  const hasVerifiedGitHub = Boolean(githubInstallations?.length);
  const githubConfigured = Boolean(githubConnectSettings());

  return (
    <AppShell>
      <main className="main-content atlas-apps-page" id="main-content">
        <header className="atlas-apps-intro">
          <div>
            <p className="atlas-overline">INTÉGRATIONS ATLAS</p>
            <h1>Mes Apps</h1>
            <p>Vos outils, prêts à travailler avec vos agents IA.</p>
          </div>
          <Link className="atlas-apps-agents-link" href="/agents">
            <Icon name="bot" /> Mes agents <Icon name="arrow-right" />
          </Link>
        </header>
        {github === "connected" ? <p role="status">Installation GitHub vérifiée. Vous pouvez explorer ses dépôts autorisés.</p> :
          github ? <p role="alert">La connexion GitHub n&apos;a pas abouti. Vous pouvez réessayer après vérification.</p> : null}
        <AppsDirectory githubConfigured={githubConfigured} hasVerifiedGitHub={hasVerifiedGitHub}
          githubSlot={<section id="atlas-github-connection" className="atlas-github-panel" aria-label="Intégration GitHub">
            <GitHubWorkspacePicker workspaces={workspaces} isConfigured={githubConfigured}/>
          </section>}/>
      </main>
    </AppShell>
  );
}
