import { NextRequest } from "next/server";
import { normalizeTeamRequestManifest, type TeamRequestManifest } from "../../../../../packages/engines/mausbot/src/team-request.mjs";
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
  const visible = data.slice(0, 50);
  let summaries: Record<string, {name:string;title:string;description:string}> = {};
  const teamSummaries: Record<string, TeamRequestManifest["team"]> = {};
  if (visible.some(item => ["agents.create", "teams.import"].includes(item.primitive_id))) {
    const details = await supabase.rpc("atlas_engine_pending_agent_profiles", { p_workspace_id: workspaceId });
    if (details.error || !Array.isArray(details.data)) return engineFailure("APPROVAL_DETAILS_UNAVAILABLE", 503);
    const rows = details.data as Array<{run_id?: unknown; request_summary?: unknown}>;
    summaries = Object.fromEntries(rows.flatMap(row => {
      const summary = row.request_summary;
      if (typeof row.run_id !== "string" || !summary || typeof summary !== "object" || Array.isArray(summary)) return [];
      const profile = summary as Record<string, unknown>;
      if (profile.format === "openmaus.team") {
        try { teamSummaries[row.run_id] = normalizeTeamRequestManifest(profile).team; } catch { /* Missing/invalid details remain non-approvable. */ }
        return [];
      }
      if (typeof profile.name !== "string" || typeof profile.title !== "string" || typeof profile.description !== "string") return [];
      return [[row.run_id, { name: profile.name.slice(0,100), title: profile.title.slice(0,200), description: profile.description.slice(0,1000) }]];
    }));
  }
  return engineSuccess({
    approvals: visible.map(item => ({...item, agentProfile: summaries[item.run_id] ?? null, teamProfile: teamSummaries[item.run_id] ?? null})),
    readOnly: true,
    canApprove: false,
    canDispatch: false,
  });
}


/** Records a one-time human decision. NEVER dispatches or connects an engine. */
export async function POST(request: NextRequest) {
  if (request.headers.get("origin") !== request.nextUrl.origin)
    return engineFailure("ORIGIN_FORBIDDEN", 403);
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    return engineFailure("CONTENT_TYPE_INVALID", 415);
  let input: unknown;
  try {
    const raw = await request.text();
    if (raw.length > 2048) return engineFailure("REQUEST_TOO_LARGE", 413);
    input = JSON.parse(raw);
  } catch { return engineFailure("INVALID_JSON", 400); }
  if (!input || typeof input !== "object" || Array.isArray(input))
    return engineFailure("APPROVAL_INPUT_INVALID", 400);
  const body = input as Record<string, unknown>;
  const fields = ["workspaceId", "runId", "intentDigest", "decision"];
  if (Object.keys(body).length !== fields.length ||
      fields.some(key => !Object.hasOwn(body, key)))
    return engineFailure("APPROVAL_INPUT_INVALID", 400);
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (typeof body.workspaceId !== "string" || !uuid.test(body.workspaceId) ||
      typeof body.runId !== "string" || !uuid.test(body.runId) ||
      typeof body.intentDigest !== "string" || !/^[a-f0-9]{64}$/.test(body.intentDigest) ||
      (body.decision !== "approved" && body.decision !== "rejected"))
    return engineFailure("APPROVAL_INPUT_INVALID", 400);
  const access = await requireEngineWorkspace(body.workspaceId, true);
  if (!access.ok) return access.response;
  const supabase = await createSupabaseServerClient();
  if (!supabase) return engineFailure("AUTH_UNAVAILABLE", 503);
  // The invoker SQL function verifies auth.sessions, current role, actor
  // separation, exact immutable run fingerprint and CAS/audit in one transaction.
  const { data, error } = await supabase.rpc("atlas_engine_decide_approval", {
    p_workspace_id: body.workspaceId,
    p_run_id: body.runId,
    p_intent_digest: body.intentDigest,
    p_decision: body.decision,
  });
  if (error) return engineFailure("APPROVAL_DECISION_NOT_APPLIED", 409);
  if (!Array.isArray(data) || data.length !== 1 ||
      data[0]?.run_id !== body.runId || data[0]?.decision !== body.decision ||
      data[0]?.can_dispatch !== false)
    return engineFailure("APPROVAL_DECISION_UNAVAILABLE", 503);
  return engineSuccess({
    runId: body.runId,
    decision: body.decision,
    canDispatch: false,
    note: "HUMAN_DECISION_ONLY_NO_ENGINE_DISPATCH",
  });
}
