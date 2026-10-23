import { requireUser } from "@/lib/auth";

export async function getOrCreateDefaultWorkspace() {
  const { supabase, user } = await requireUser();
  const { data: memberships, error } = await supabase
    .from("workspace_members")
    .select("workspace_id, role, workspaces(id, name)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1);
  if (error) throw new Error("Impossible de charger vos workspaces.");
  const membership = memberships?.[0];
  const workspace = Array.isArray(membership?.workspaces) ? membership.workspaces[0] : membership?.workspaces;
  if (membership && workspace) return { user, membership, workspace };

  const { data: created, error: createError } = await supabase
    .from("workspaces")
    .insert({ name: "Espace personnel", created_by: user.id })
    .select("id, name")
    .single();
  if (createError || !created) throw new Error("Impossible de créer votre workspace personnel.");
  return { user, membership: { workspace_id: created.id, role: "owner" }, workspace: created };
}
