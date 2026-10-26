import { NextRequest, NextResponse } from "next/server";
import { requireAgentOwner, agentError } from "@/lib/agent-gateway/access";
import { readAgentSetting, saveAgentSetting } from "@/lib/agent-gateway/settings";
import { ENTITIES, PAGE_KEY } from "@/lib/agent-gateway/policy.mjs";
import { mausbotReleaseState } from "../../../../../packages/engine-core/src/release-gates.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
function errorResponse(error: unknown) {
  const safe = agentError(error);
  return NextResponse.json({ error: safe.code }, { status: safe.status, headers });
}
export async function GET(request: NextRequest) {
  try {
    const workspaceId = request.nextUrl.searchParams.get("workspaceId");
    const pageKey = request.nextUrl.searchParams.get("pageKey") ?? "missions";
    const { supabase } = await requireAgentOwner(workspaceId);
    const settings = await readAgentSetting(supabase, workspaceId as string, pageKey);
    return NextResponse.json({ settings, entities: ENTITIES,
      release: mausbotReleaseState(process.env) }, { headers });
  } catch (error) { return errorResponse(error); }
}
export async function PUT(request: NextRequest) {
  if (request.headers.get("origin") !== request.nextUrl.origin)
    return NextResponse.json({ error: "ORIGIN_FORBIDDEN" }, { status: 403, headers });
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json")
    return NextResponse.json({ error: "CONTENT_TYPE_INVALID" }, { status: 415, headers });
  let payload: unknown;
  try {
    const raw = await request.text();
    if (Buffer.byteLength(raw,"utf8") > 2048)
      return NextResponse.json({ error: "REQUEST_TOO_LARGE" }, { status: 413, headers });
    payload = JSON.parse(raw);
  } catch { return NextResponse.json({ error: "INVALID_REQUEST" }, { status: 400, headers }); }
  if (!payload || typeof payload !== "object" || Array.isArray(payload))
    return NextResponse.json({ error: "INVALID_REQUEST" }, { status: 400, headers });
  const body = payload as Record<string, unknown>;
  if (Object.keys(body).some((key) => !["workspaceId","pageKey","entity","agentId"].includes(key)) ||
    typeof body.pageKey !== "string" || !PAGE_KEY.test(body.pageKey) ||
    typeof body.agentId !== "string" || typeof body.entity !== "string")
    return NextResponse.json({ error: "INVALID_SETTING" }, { status: 400, headers });
  try {
    const { supabase,userId } = await requireAgentOwner(body.workspaceId);
    const settings = await saveAgentSetting(supabase,body.workspaceId as string,userId,
      body.pageKey,body.agentId,body.entity);
    return NextResponse.json({ settings }, { headers });
  } catch (error) { return errorResponse(error); }
}
