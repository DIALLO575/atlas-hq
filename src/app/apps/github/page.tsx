import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { GitHubControlCenter } from "@/components/github-control-center";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { githubConnectSettings } from "@/lib/github/connect";

export const dynamic = "force-dynamic";

export default async function GitHubPage({
  searchParams,
}: {
  searchParams: Promise<{ workspaceId?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = supabase
    ? await supabase.auth.getUser() : { data: { user: null } };
  const { data: memberships, error } = user && supabase
    ? await supabase.from("workspace_members")
      .select("workspace_id, role, workspaces!inner(name)")
      .eq("user_id", user.id).order("created_at", { ascending: true })
    : { data: null, error: null };

  const workspaces = (memberships ?? []).flatMap((item) => {
    const space = Array.isArray(item.workspaces) ? item.workspaces[0] : item.workspaces;
    if (!space || !["owner", "admin", "member"].includes(item.role)) return [];
    return [{
      id: item.workspace_id,
      name: space.name,
      role: item.role as "owner" | "admin" | "member",
    }];
  });
  const initialWorkspaceId = workspaces.some((workspace) => workspace.id === params.workspaceId)
    ? params.workspaceId! : workspaces[0]?.id ?? "";
  return (
    <AppShell>
      <main className="main-content atlas-github-page" id="main-content">
        <nav className="atlas-gh-crumbs" aria-label="Fil d’Ariane">
          <Link href="/apps">Mes Apps</Link><span aria-hidden="true">/</span><strong>GitHub</strong>
        </nav>
        {error ? (
          <div className="atlas-gh-notice" role="alert">Impossible de charger vos espaces. <Link href="/apps/github">Réessayer</Link></div>
        ) : (
          <GitHubControlCenter workspaces={workspaces}
            initialWorkspaceId={initialWorkspaceId}
            configured={Boolean(githubConnectSettings())} />
        )}
      </main>
    </AppShell>
  );
}
