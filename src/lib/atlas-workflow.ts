import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Workspace } from "@/lib/workspaces/contract";

export type AtlasMission = {
  id: string; workspaceId: string; title: string; description: string;
  priority: "normal" | "high"; status: "planned" | "active" | "review" | "done";
  createdBy: string; createdAt: string; updatedAt: string;
};
export type AtlasReview = {
  id: string; missionId: string; workspaceId: string;
  requestedBy: string; decision: "pending" | "approved" | "rejected";
  createdAt: string; decidedAt: string | null; title: string; description: string;
};
export type WorkflowRead = {
  status: "ready"; spaces: Workspace[]; selected: Workspace | null;
  userId: string; missions: AtlasMission[]; reviews: AtlasReview[];
} | { status: "error"; message: string };

export async function readAtlasWorkflow(requestedWorkspaceId?: string): Promise<WorkflowRead> {
  try {
    // One authenticated request and one membership lookup, instead of calling
    // listWorkspaces() (which already checks auth) and then checking auth again.
    // RLS is still enforced on every workspace-scoped data query below.
    const supabase = await createSupabaseServerClient();
    if (!supabase) return { status: "error", message: "Service de données indisponible." };
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return { status: "error", message: "Session expirée. Reconnectez-vous." };
    const { data: memberships, error: membershipsError } = await supabase
      .from("workspace_members")
      .select("workspace_id, role, workspaces!inner(id, name)")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true });
    if (membershipsError || !memberships) {
      return { status: "error", message: "Impossible de charger les workspaces." };
    }
    const spaces: Workspace[] = memberships.flatMap((membership) => {
      const workspace = Array.isArray(membership.workspaces)
        ? membership.workspaces[0] : membership.workspaces;
      if (!workspace || !["owner", "admin", "member"].includes(membership.role)) return [];
      return [{ id: workspace.id, name: workspace.name, role: membership.role as Workspace["role"] }];
    });
    const selected = requestedWorkspaceId
      ? spaces.find((space) => space.id === requestedWorkspaceId)
      : spaces[0];
    if (requestedWorkspaceId && !selected) {
      return { status: "error", message: "Vous n’avez pas accès à cet espace." };
    }
    if (!selected) return { status: "ready", spaces, selected: null, userId: user.id, missions: [], reviews: [] };

    // RLS enforces workspace membership again at the database boundary.
    const [missionsResult, reviewsResult] = await Promise.all([
      supabase.from("atlas_missions")
        .select("id, workspace_id, title, description, priority, status, created_by, created_at, updated_at")
        .eq("workspace_id", selected.id).order("updated_at", { ascending: false }).limit(200),
      supabase.from("atlas_mission_reviews")
        .select("id, workspace_id, mission_id, requested_by, decision, created_at, decided_at, atlas_missions!inner(title, description)")
        .eq("workspace_id", selected.id).order("created_at", { ascending: false }).limit(200),
    ]);
    if (missionsResult.error || reviewsResult.error) {
      return { status: "error", message: "Missions et validations indisponibles. Le service doit être activé sur ce workspace." };
    }
    const missions: AtlasMission[] = (missionsResult.data ?? []).map((row) => ({
      id: row.id, workspaceId: row.workspace_id, title: row.title,
      description: row.description, priority: row.priority as AtlasMission["priority"],
      status: row.status as AtlasMission["status"], createdBy: row.created_by,
      createdAt: row.created_at, updatedAt: row.updated_at,
    }));
    const reviews: AtlasReview[] = (reviewsResult.data ?? []).flatMap((row) => {
      const source = Array.isArray(row.atlas_missions) ? row.atlas_missions[0] : row.atlas_missions;
      if (!source) return [];
      return [{
        id: row.id, missionId: row.mission_id, workspaceId: row.workspace_id,
        requestedBy: row.requested_by, decision: row.decision as AtlasReview["decision"],
        createdAt: row.created_at, decidedAt: row.decided_at,
        title: source.title, description: source.description,
      }];
    });
    return { status: "ready", spaces, selected, userId: user.id, missions, reviews };
  } catch {
    return { status: "error", message: "Impossible de récupérer les données de ce workspace." };
  }
}
