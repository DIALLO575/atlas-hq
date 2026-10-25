import { NextRequest } from "next/server";
import { engineFailure, engineSuccess, requireEngineWorkspace } from "@/lib/engines/access";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { normalizeTeamRequestManifest } from "../../../../../packages/engines/mausbot/src/team-request.mjs";
export { GET } from "../agent-requests/route";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Audited offline team-profile request only. No engine transport. */
export async function POST(request: NextRequest) {
  if (request.headers.get("origin") !== request.nextUrl.origin) return engineFailure("ORIGIN_FORBIDDEN", 403);
  if (!request.headers.get("content-type")?.startsWith("application/json")) return engineFailure("CONTENT_TYPE_INVALID", 415);
  let body: Record<string, unknown>;
  try {
    const raw = await request.text();
    if (Buffer.byteLength(raw, "utf8") > 65536) return engineFailure("REQUEST_TOO_LARGE", 413);
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return engineFailure("TEAM_REQUEST_INVALID", 400);
    body = parsed as Record<string, unknown>;
  } catch { return engineFailure("INVALID_JSON", 400); }
  const fields = ["workspaceId", "instanceId", "missionId", "requestId", "manifest"];
  if (Object.keys(body).length !== fields.length || fields.some(key => !Object.hasOwn(body, key)) ||
      fields.slice(0,4).some(key => typeof body[key] !== "string" || !uuid.test(body[key] as string))) return engineFailure("TEAM_REQUEST_INVALID", 400);
  let manifest;
  try { manifest = normalizeTeamRequestManifest(body.manifest); }
  catch { return engineFailure("TEAM_REQUEST_MANIFEST_INVALID", 400); }
  const access = await requireEngineWorkspace(body.workspaceId, true);
  if (!access.ok) return access.response;
  const supabase = await createSupabaseServerClient();
  if (!supabase) return engineFailure("AUTH_UNAVAILABLE", 503);
  const { data, error } = await supabase.rpc("atlas_engine_request_team", {
    p_workspace_id: body.workspaceId, p_instance_id: body.instanceId, p_mission_id: body.missionId,
    p_request_id: body.requestId, p_manifest: manifest,
  });
  if (error || !Array.isArray(data) || data.length !== 1 || data[0]?.run_id !== body.requestId ||
      data[0]?.can_dispatch !== false || !/^[a-f0-9]{64}$/.test(data[0]?.intent_digest ?? "")) return engineFailure("TEAM_REQUEST_NOT_RECORDED", 409);
  return engineSuccess({ request: data[0], canDispatch: false }, data[0].created ? 201 : 200);
}
