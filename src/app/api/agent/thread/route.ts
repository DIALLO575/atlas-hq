import { NextRequest, NextResponse } from "next/server";
import { historyForObject, poll } from "@/lib/agent-gateway";
import { agentError } from "@/lib/agent-gateway/access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
export async function GET(request: NextRequest) {
  try {
    const query = request.nextUrl.searchParams;
    const workspaceId = query.get("workspaceId") ?? "";
    const id = query.get("threadId");
    const pageKey = query.get("pageKey");
    if ((id && pageKey) || (!id && pageKey !== "missions") ||
      (pageKey && query.has("afterId")))
      return NextResponse.json({ error: "INVALID_THREAD_REQUEST" }, { status: 400, headers });
    const data = id
      ? await poll(workspaceId, id, query.get("afterId") ?? undefined)
      : await historyForObject(workspaceId, pageKey!, query.get("objectId"));
    return NextResponse.json(data, { headers });
  } catch (error) {
    const safe = agentError(error);
    return NextResponse.json({ error: safe.code }, { status: safe.status, headers });
  }
}
