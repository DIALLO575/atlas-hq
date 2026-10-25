import { NextRequest } from "next/server";
import { engineFailure, engineSuccess, requireEngineWorkspace } from "@/lib/engines/access";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ATLAS_WORKSPACE_ID } from "../../../../../../packages/engine-core/src/catalog.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const columns = "id,instance_id,remote_workflow_id,name,remote_active,sync_state,remote_updated_at,last_seen_at";

/**
 * RLS-backed Atlas registry ONLY. This route never contacts n8n, imports
 * workflow definitions, reads run payloads or makes provider state changes.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const workspaceId = params.get("workspaceId");
  const access = await requireEngineWorkspace(workspaceId);
  if (!access.ok) return access.response;
  if (params.getAll("workspaceId").length !== 1 ||
      [...params.keys()].some(key => !["workspaceId", "instanceId"].includes(key)) ||
      params.getAll("instanceId").length > 1) {
    return engineFailure("N8N_QUERY_INVALID", 400);
  }
  const instanceId = params.get("instanceId");
  if (instanceId !== null && !ATLAS_WORKSPACE_ID.test(instanceId))
    return engineFailure("N8N_INSTANCE_ID_INVALID", 400);
  const supabase = await createSupabaseServerClient();
  if (!supabase) return engineFailure("AUTH_UNAVAILABLE", 503);

  // Prove instance is in the same workspace AND is an n8n engine before
  // returning even an empty collection for instance-specific lookups.
  if (instanceId !== null) {
    const { data: registered, error: instanceError } = await supabase
      .from("atlas_engine_instances").select("id")
      .eq("workspace_id", workspaceId).eq("engine_key", "n8n")
      .eq("id", instanceId).maybeSingle();
    if (instanceError) return engineFailure("N8N_REGISTRY_UNAVAILABLE", 503);
    if (!registered) return engineFailure("N8N_INSTANCE_NOT_FOUND", 404);
  }

  let query = supabase.from("atlas_automation_workflows")
    .select(columns).eq("workspace_id", workspaceId)
    .order("updated_at", { ascending: false }).limit(50);
  if (instanceId !== null) query = query.eq("instance_id", instanceId);
  const { data, error } = await query;
  if (error) return engineFailure("N8N_REGISTRY_UNAVAILABLE", 503);
  const workflows = (data ?? []).map(row => ({
    id: row.id, instanceId: row.instance_id, remoteId: row.remote_workflow_id,
    name: row.name, remoteActive: row.remote_active,
    syncState: row.sync_state, remoteUpdatedAt: row.remote_updated_at,
    lastSeenAt: row.last_seen_at,
  }));
  return engineSuccess({
    source: "atlas-registry",
    readOnly: true,
    providerConnected: false,
    liveSyncEnabled: false,
    workflows,
    note: "NO_PROVIDER_NETWORK_ACCESS",
  });
}
