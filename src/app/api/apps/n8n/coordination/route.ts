import { NextRequest } from "next/server";
import { engineFailure, engineSuccess, requireEngineWorkspace } from "@/lib/engines/access";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ATLAS_WORKSPACE_ID } from "../../../../../../packages/engine-core/src/catalog.mjs";
import { projectN8nCoordination } from "../../../../../../packages/engines/n8n/src/coordination.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * One RLS-backed, workspace-scoped projection shared by Chief/Agents/Missions.
 * No live n8n calls, no agent binding claims, no provider secrets/raw outputs.
 */
export async function GET(request: NextRequest) {
  const params=request.nextUrl.searchParams;
  const workspaceId=params.get("workspaceId");
  const access=await requireEngineWorkspace(workspaceId);
  if(!access.ok)return access.response;
  if(params.getAll("workspaceId").length!==1||
      params.getAll("missionId").length>1||
      [...params.keys()].some(k=>k!=="workspaceId"&&k!=="missionId"))
    return engineFailure("N8N_COORDINATION_QUERY_INVALID",400);
  const missionId=params.get("missionId");
  if(missionId!==null&&!ATLAS_WORKSPACE_ID.test(missionId))
    return engineFailure("N8N_COORDINATION_MISSION_INVALID",400);
  const supabase=await createSupabaseServerClient();
  if(!supabase)return engineFailure("AUTH_UNAVAILABLE",503);
  // The same authenticated Supabase SSR client uses RLS for BOTH tables.
  const workflowQuery=supabase.from("atlas_automation_workflows")
    .select("id,workspace_id,instance_id,name,sync_state,last_seen_at")
    .eq("workspace_id",workspaceId).order("updated_at",{ascending:false}).limit(51);
  let executionQuery=supabase.from("atlas_automation_executions")
    .select("id,workspace_id,instance_id,workflow_id,mission_id,status,started_at,stopped_at,last_seen_at")
    .eq("workspace_id",workspaceId).order("created_at",{ascending:false}).limit(51);
  if(missionId!==null)executionQuery=executionQuery.eq("mission_id",missionId);
  const [workflowResult,executionResult]=await Promise.all([workflowQuery,executionQuery]);
  if(workflowResult.error||executionResult.error)
    return engineFailure("N8N_COORDINATION_REGISTRY_UNAVAILABLE",503);
  try{
    return engineSuccess(projectN8nCoordination({
      workspaceId:workspaceId!,missionId,
      workflowRows:workflowResult.data??[],executionRows:executionResult.data??[],
    }));
  }catch{
    return engineFailure("N8N_COORDINATION_DATA_INVALID",503);
  }
}
