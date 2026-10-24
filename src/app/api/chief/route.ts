import { NextRequest, NextResponse } from "next/server";
import { readAtlasWorkflow } from "@/lib/atlas-workflow";
import { buildChiefReply } from "@/lib/chief/briefing";

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const headers = { "Cache-Control": "no-store" };

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin)
    return NextResponse.json({error:"ORIGIN_FORBIDDEN"},{status:403,headers});
  let payload: unknown;
  try { payload = await request.json(); } catch {
    return NextResponse.json({error:"INVALID_REQUEST"},{status:400,headers});
  }
  if (!payload || typeof payload !== "object")
    return NextResponse.json({error:"INVALID_REQUEST"},{status:400,headers});
  const {workspaceId,message} = payload as Record<string,unknown>;
  if (typeof workspaceId !== "string" || !UUID.test(workspaceId) ||
      typeof message !== "string" || !message.trim() || message.length > 700)
    return NextResponse.json({error:"INVALID_REQUEST"},{status:400,headers});
  const data = await readAtlasWorkflow(workspaceId);
  if (data.status !== "ready" || !data.selected)
    return NextResponse.json({error:"WORKSPACE_UNAVAILABLE"},{status:403,headers});
  const reply = buildChiefReply(message.trim(),data.selected.name,data.missions,data.reviews,data.userId,
    data.selected.role === "owner" || data.selected.role === "admin");
  return NextResponse.json({reply},{headers});
}
