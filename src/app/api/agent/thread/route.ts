import { NextRequest, NextResponse } from "next/server";
import { poll } from "@/lib/agent-gateway";
import { agentError } from "@/lib/agent-gateway/access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
export async function GET(request: NextRequest) {
  try {
    const query = request.nextUrl.searchParams;
    const data = await poll(query.get("workspaceId") ?? "", query.get("threadId") ?? "",
      query.get("afterId") ?? undefined);
    return NextResponse.json(data, { headers });
  } catch (error) {
    const safe = agentError(error);
    return NextResponse.json({ error: safe.code }, { status: safe.status, headers });
  }
}
