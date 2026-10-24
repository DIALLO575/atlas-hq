import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { LinearControlCenter } from "@/components/linear-control-center";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { linearConnectSettings, linearTokenVault } from "@/lib/linear/connect";

export const dynamic = "force-dynamic";

export default async function LinearPage({
  searchParams,
}: { searchParams: Promise<{ workspaceId?: string; linear?: string }> }) {
  const params = await searchParams;
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = supabase ? await supabase.auth.getUser() : { data: { user: null } };
  const { data: memberships, error } = user && supabase
    ? await supabase.from("workspace_members")
      .select("workspace_id, role, workspaces!inner(name)")
      .eq("user_id", user.id).order("created_at", { ascending: true })
    : { data: null, error: null };
  const workspaces = (memberships ?? []).flatMap((item) => {
    const space = Array.isArray(item.workspaces) ? item.workspaces[0] : item.workspaces;
    if (!space || !["owner", "admin", "member"].includes(item.role)) return [];
    return [{ id: item.workspace_id, name: space.name, role: item.role as "owner" | "admin" | "member" }];
  });
  const initialWorkspaceId = workspaces.some((workspace) => workspace.id === params.workspaceId)
    ? params.workspaceId! : workspaces[0]?.id ?? "";

  return <AppShell>
    <main className="main-content atlas-github-page" id="main-content">
      <nav className="atlas-gh-crumbs" aria-label="Fil d’Ariane">
        <Link href="/apps">Mes Apps</Link><span aria-hidden="true">/</span><strong>Linear</strong>
      </nav>
      <LinearControlCenter workspaces={workspaces} initialWorkspaceId={initialWorkspaceId}
        configured={Boolean(linearConnectSettings() && linearTokenVault())}
        feedback={params.linear ?? ""} workspaceLoadFailed={Boolean(error)} />
    </main>
  </AppShell>;
}
