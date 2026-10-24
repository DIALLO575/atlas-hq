import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ATLAS_WORKSPACE_ID } from "../../../packages/engine-core/src/catalog.mjs";

type Role = "owner" | "admin" | "member";
type AccessResult =
  | { ok: true; role: Role }
  | { ok: false; response: NextResponse };

export function engineFailure(error: string, status: number): NextResponse {
  return NextResponse.json({ error }, { status, headers: { "Cache-Control": "private, no-store" } });
}

export function engineSuccess(data: unknown, status = 200): NextResponse {
  return NextResponse.json(data, { status, headers: { "Cache-Control": "private, no-store" } });
}

export async function requireEngineWorkspace(workspaceId: unknown, write = false): Promise<AccessResult> {
  if (typeof workspaceId !== "string" || !ATLAS_WORKSPACE_ID.test(workspaceId)) {
    return { ok: false, response: engineFailure("INVALID_WORKSPACE_ID", 400) };
  }
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { ok: false, response: engineFailure("AUTH_UNAVAILABLE", 503) };
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return { ok: false, response: engineFailure("AUTH_REQUIRED", 401) };
  const { data: row, error } = await supabase.from("workspace_members").select("role")
    .eq("workspace_id", workspaceId).eq("user_id", user.id).maybeSingle();
  if (error) return { ok: false, response: engineFailure("WORKSPACE_UNAVAILABLE", 503) };
  if (!row || !["owner", "admin", "member"].includes(row.role)) {
    return { ok: false, response: engineFailure("WORKSPACE_FORBIDDEN", 403) };
  }
  if (write && row.role !== "owner" && row.role !== "admin") {
    return { ok: false, response: engineFailure("ENGINE_WRITE_FORBIDDEN", 403) };
  }
  return { ok: true, role: row.role as Role };
}
