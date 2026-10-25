import { NextRequest } from "next/server";
import { engineFailure, engineSuccess, requireEngineWorkspace } from "@/lib/engines/access";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Workspace data only; never contacts MAUSBOT. */
export async function GET(request: NextRequest) {
  const workspaceId = request.nextUrl.searchParams.get("workspaceId");
  const access = await requireEngineWorkspace(workspaceId, true);
  if (!access.ok) return access.response;
  const supabase = await createSupabaseServerClient();
  if (!supabase) return engineFailure("AUTH_UNAVAILABLE", 503);
  const [instances, missions] = await Promise.all([
    supabase.from("atlas_engine_instances").select("id,label").eq("workspace_id", workspaceId)
      .eq("engine_key", "mausbot").eq("connection_state", "offline").order("created_at", { ascending: false }).limit(50),
    supabase.from("atlas_missions").select("id,title").eq("workspace_id", workspaceId)
      .in("status", ["planned", "active"]).order("created_at", { ascending: false }).limit(50),
  ]);
  if (instances.error || missions.error) return engineFailure("AGENT_REQUEST_CONTEXT_UNAVAILABLE", 503);
  return engineSuccess({ instances: instances.data, missions: missions.data, canDispatch: false });
}

/** Creates only an audited, pending human request. No engine/outbox operation. */
export async function POST(request: NextRequest) {
  if (request.headers.get("origin") !== request.nextUrl.origin) return engineFailure("ORIGIN_FORBIDDEN", 403);
  if (!request.headers.get("content-type")?.startsWith("application/json")) return engineFailure("CONTENT_TYPE_INVALID", 415);
  let body: Record<string, unknown>;
  try {
    const raw = await request.text();
    if (raw.length > 8192) return engineFailure("REQUEST_TOO_LARGE", 413);
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return engineFailure("AGENT_REQUEST_INVALID", 400);
    body = parsed as Record<string, unknown>;
  } catch { return engineFailure("INVALID_JSON", 400); }
  const fields = ["workspaceId", "instanceId", "missionId", "requestId", "name", "title", "description"];
  if (Object.keys(body).length !== fields.length || fields.some(key => !Object.hasOwn(body, key)) ||
    ["workspaceId", "instanceId", "missionId", "requestId"].some(key => typeof body[key] !== "string" || !uuid.test(body[key] as string)) ||
    typeof body.name !== "string" || !body.name.trim() || body.name.trim().length > 100 || /[\x00-\x1f\x7f]/.test(body.name) ||
    typeof body.title !== "string" || body.title.length > 200 || /[\x00-\x1f\x7f]/.test(body.title) ||
    typeof body.description !== "string" || body.description.length > 1000) return engineFailure("AGENT_REQUEST_INVALID", 400);
  const access = await requireEngineWorkspace(body.workspaceId, true);
  if (!access.ok) return access.response;
  const supabase = await createSupabaseServerClient();
  if (!supabase) return engineFailure("AUTH_UNAVAILABLE", 503);
  const { data, error } = await supabase.rpc("atlas_engine_request_agent", {
    p_workspace_id: body.workspaceId, p_instance_id: body.instanceId, p_mission_id: body.missionId,
    p_request_id: body.requestId, p_name: body.name, p_title: body.title, p_description: body.description,
  });
  if (error || !Array.isArray(data) || data.length !== 1 || data[0]?.run_id !== body.requestId ||
      data[0]?.can_dispatch !== false || !/^[a-f0-9]{64}$/.test(data[0]?.intent_digest ?? ""))
    return engineFailure("AGENT_REQUEST_NOT_RECORDED", 409);
  return engineSuccess({ request: data[0], canDispatch: false }, data[0].created ? 201 : 200);
}
