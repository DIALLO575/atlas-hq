import { NextRequest, NextResponse } from "next/server";
import { ask } from "@/lib/agent-gateway";
import { agentError } from "@/lib/agent-gateway/access";
import type { AtlasPageContext } from "@/lib/agent-gateway/context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
export async function POST(request: NextRequest) {
  if (request.headers.get("origin") !== request.nextUrl.origin)
    return NextResponse.json({ error: "ORIGIN_FORBIDDEN" }, { status: 403, headers });
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json")
    return NextResponse.json({ error: "CONTENT_TYPE_INVALID" }, { status: 415, headers });
  let raw: string;
  try { raw = await request.text(); } catch {
    return NextResponse.json({ error: "INVALID_REQUEST" }, { status: 400, headers });
  }
  if (Buffer.byteLength(raw, "utf8") > 8192)
    return NextResponse.json({ error: "REQUEST_TOO_LARGE" }, { status: 413, headers });
  let payload: unknown;
  try { payload = JSON.parse(raw); } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400, headers });
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload))
    return NextResponse.json({ error: "INVALID_REQUEST" }, { status: 400, headers });
  const body = payload as Record<string, unknown>;
  if (Object.keys(body).some((key) => !["pageKey","context","question","sendId"].includes(key)) ||
    !body.context || typeof body.context !== "object" || Array.isArray(body.context))
    return NextResponse.json({ error: "INVALID_REQUEST" }, { status: 400, headers });
  try {
    const result = await ask(body.pageKey as string, body.context as AtlasPageContext,
      body.question as string, body.sendId as string);
    return NextResponse.json(result, { status: result.accepted ? 202 : 200, headers });
  } catch (error) {
    const safe = agentError(error);
    return NextResponse.json({ error: safe.code }, { status: safe.status, headers });
  }
}
