import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { N8nControlCenter } from "@/components/n8n-control-center";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import "./n8n-console.css";

export const dynamic = "force-dynamic";

export default async function N8nPage({
  searchParams,
}: { searchParams: Promise<{ workspaceId?: string }> }) {
  const params = await searchParams;
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = supabase
    ? await supabase.auth.getUser() : { data: { user: null } };
  const { data: memberships, error } = user && supabase
    ? await supabase.from("workspace_members")
      .select("workspace_id,role,workspaces!inner(name)")
      .eq("user_id", user.id).order("created_at", { ascending: true })
    : { data: null, error: null };
  const workspaces = (memberships ?? []).flatMap(item => {
    const workspace = Array.isArray(item.workspaces) ? item.workspaces[0] : item.workspaces;
    if (!workspace || !["owner", "admin", "member"].includes(item.role)) return [];
    return [{ id: item.workspace_id, name: workspace.name,
      role: item.role as "owner" | "admin" | "member" }];
  });
  const selectedId = workspaces.some(w => w.id === params.workspaceId)
    ? params.workspaceId! : workspaces[0]?.id ?? "";

  return <AppShell><main className="main-content atlas-n8n-page" id="main-content">
    <nav className="atlas-gh-crumbs" aria-label="Fil d’Ariane">
      <Link href="/apps">Mes Apps</Link><span aria-hidden="true">/</span><strong>n8n</strong>
    </nav>
    <N8nControlCenter workspaces={workspaces} initialWorkspaceId={selectedId}
      workspaceLoadFailed={Boolean(error)} />
  </main></AppShell>;
}
