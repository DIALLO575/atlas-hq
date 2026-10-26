import { NextRequest, NextResponse } from "next/server";
import { prepareInterrupt } from "@/lib/agent-gateway";
import { agentError } from "@/lib/agent-gateway/access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
export async function POST(request: NextRequest) {
  if (request.headers.get("origin") !== request.nextUrl.origin)
    return NextResponse.json({ error: "ORIGIN_FORBIDDEN" }, { status: 403, headers });
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json")
    return NextResponse.json({ error: "CONTENT_TYPE_INVALID" }, { status: 415, headers });
  let body: unknown;
  try {
    const raw = await request.text();
    if (Buffer.byteLength(raw, "utf8") > 1024)
      return NextResponse.json({ error: "REQUEST_TOO_LARGE" }, { status: 413, headers });
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "INVALID_REQUEST" }, { status: 400, headers });
  }
  if (!body || typeof body !== "object" || Array.isArray(body) ||
    Object.keys(body).some((key) => !["workspaceId","threadId"].includes(key)))
    return NextResponse.json({ error: "INVALID_REQUEST" }, { status: 400, headers });
  const payload = body as Record<string, unknown>;
  try {
    await prepareInterrupt(payload.workspaceId, payload.threadId);
    // Cannot be reached with B2's permanent release gate.
    return NextResponse.json({ error: "MAUSBOT_DURABLE_APPROVAL_REQUIRED" }, { status: 423, headers });
  } catch (error) {
    const safe = agentError(error);
    return NextResponse.json({ error: safe.code }, { status: safe.status, headers });
  }
}
