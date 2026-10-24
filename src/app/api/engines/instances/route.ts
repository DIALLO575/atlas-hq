import { NextRequest } from "next/server";
import { engineFailure, engineSuccess, requireEngineWorkspace } from "@/lib/engines/access";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { planEngineRegistration, EnginePersistenceInputError }
  from "../../../../../packages/engine-core/src/persistence-contracts.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const columns = "id,workspace_id,engine_key,label,transport,connection_state,created_at";

/** Returns only workspace-scoped metadata. This does not query an engine. */
export async function GET(request: NextRequest) {
  const workspaceId = request.nextUrl.searchParams.get("workspaceId");
  const access = await requireEngineWorkspace(workspaceId);
  if (!access.ok) return access.response;
  const supabase = await createSupabaseServerClient();
  if (!supabase) return engineFailure("AUTH_UNAVAILABLE", 503);
  const { data, error } = await supabase.from("atlas_engine_instances")
    .select(columns).eq("workspace_id", workspaceId).order("created_at", { ascending: false })
    .limit(50);
  if (error) return engineFailure("ENGINE_REGISTRY_UNAVAILABLE", 503);
  return engineSuccess({ instances: data ?? [], connected: false, note: "PRECONNECTION_ONLY" });
}

/** Admin creates an OFFLINE registry record only; no tokens, URLs or host contact. */
export async function POST(request: NextRequest) {
  if (request.headers.get("origin") !== request.nextUrl.origin)
    return engineFailure("ORIGIN_FORBIDDEN", 403);
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    return engineFailure("CONTENT_TYPE_INVALID", 415);
  let raw: unknown;
  try {
    const text = await request.text();
    if (text.length > 8192) return engineFailure("REQUEST_TOO_LARGE", 413);
    raw = JSON.parse(text);
  } catch { return engineFailure("INVALID_JSON", 400); }
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    return engineFailure("ENGINE_REGISTRATION_INVALID", 400);
  const body = raw as Record<string, unknown>;
  if (Object.keys(body).some(k => !["workspaceId", "engineKey", "label", "transport"].includes(k)))
    return engineFailure("ENGINE_REGISTRATION_FIELD_FORBIDDEN", 400);
  const access = await requireEngineWorkspace(body.workspaceId, true);
  if (!access.ok) return access.response;
  const supabase = await createSupabaseServerClient();
  if (!supabase) return engineFailure("AUTH_UNAVAILABLE", 503);
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return engineFailure("AUTH_REQUIRED", 401);
  let registration;
  try {
    registration = planEngineRegistration({
      workspaceId: body.workspaceId, createdBy: user.id,
      engineKey: body.engineKey, label: body.label, transport: body.transport,
    });
  } catch (error) {
    if (error instanceof EnginePersistenceInputError) return engineFailure(error.code, 400);
    return engineFailure("ENGINE_REGISTRATION_INVALID", 400);
  }
  const { data, error } = await supabase.from("atlas_engine_instances")
    .insert({
      workspace_id: registration.workspaceId,
      created_by: user.id,
      engine_key: registration.engineKey,
      label: registration.label,
      transport: registration.transport,
      connection_state: "offline",
      version: 1,
    }).select(columns).single();
  if (error || !data) return engineFailure("ENGINE_REGISTRATION_FAILED", 403);
  return engineSuccess({ instance: data, connected: false, note: "OFFLINE_ONLY" }, 201);
}
