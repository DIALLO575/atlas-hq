import { NextRequest } from "next/server";
import { engineFailure, engineSuccess, requireEngineWorkspace } from "@/lib/engines/access";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Read-only, live-session-scoped approval Inbox. Not an approval endpoint. */
export async function GET(request: NextRequest) {
  const workspaceId = request.nextUrl.searchParams.get("workspaceId");
  // Browser membership is a first gate; the SQL RPC independently checks
  // active auth.sessions, CURRENT owner/admin role and anti-self-review.
  const access = await requireEngineWorkspace(workspaceId, true);
  if (!access.ok) return access.response;
  const supabase = await createSupabaseServerClient();
  if (!supabase) return engineFailure("AUTH_UNAVAILABLE", 503);
  const { data, error } = await supabase.rpc("atlas_engine_pending_approvals", {
    p_workspace_id: workspaceId,
  });
  if (error || !Array.isArray(data)) return engineFailure("APPROVAL_INBOX_UNAVAILABLE", 503);
  return engineSuccess({
    approvals: data.slice(0, 50),
    readOnly: true,
    canApprove: false,
    canDispatch: false,
  });
}
