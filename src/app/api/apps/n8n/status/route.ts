import { NextRequest } from "next/server";
import { engineFailure, engineSuccess, requireEngineWorkspace } from "@/lib/engines/access";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveN8nReadOnlyConfig, N8nReadOnlyError }
  from "../../../../../../packages/engines/n8n/src/adapter.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const columns = "id,label,transport,connection_state,created_at";

/**
 * Metadata only. No network access to n8n, no credentials or raw workflow data.
 * The Atlas session and workspace membership are verified before reading the
 * RLS-protected registry or disclosing server configuration state.
 */
export async function GET(request: NextRequest) {
  const workspaceId = request.nextUrl.searchParams.get("workspaceId");
  const access = await requireEngineWorkspace(workspaceId);
  if (!access.ok) return access.response;
  if ([...request.nextUrl.searchParams.keys()].some(key => key !== "workspaceId") ||
      request.nextUrl.searchParams.getAll("workspaceId").length !== 1) {
    return engineFailure("N8N_QUERY_INVALID", 400);
  }
  const supabase = await createSupabaseServerClient();
  if (!supabase) return engineFailure("AUTH_UNAVAILABLE", 503);
  const { data, error } = await supabase.from("atlas_engine_instances")
    .select(columns).eq("workspace_id", workspaceId).eq("engine_key", "n8n")
    .order("created_at", { ascending: false }).limit(20);
  if (error) return engineFailure("N8N_REGISTRY_UNAVAILABLE", 503);

  let serverConfiguration: "missing" | "ready-for-preconnection" | "invalid" = "missing";
  try {
    if (resolveN8nReadOnlyConfig(process.env, workspaceId ?? ""))
      serverConfiguration = "ready-for-preconnection";
  } catch (cause) {
    if (cause instanceof N8nReadOnlyError) serverConfiguration = "invalid";
    else return engineFailure("N8N_CONFIGURATION_UNAVAILABLE", 503);
  }
  const instances = (data ?? []).map(row => ({
    id: row.id, label: row.label, transport: row.transport,
    registryState: row.connection_state, createdAt: row.created_at,
  }));
  return engineSuccess({
    engine: "n8n",
    state: serverConfiguration === "invalid" ? "configuration-error"
      : serverConfiguration === "ready-for-preconnection" ? "preconnection" : "not-configured",
    serverConfiguration,
    instances,
    connected: false,
    readOnlyApiEnabled: false,
    workflowInventory: "unavailable",
    capabilitiesTestedLive: 0,
    note: "PRECONNECTION_ONLY_EGRESS_NOT_CERTIFIED",
  });
}
