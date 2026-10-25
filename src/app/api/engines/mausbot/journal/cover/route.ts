import { NextRequest, NextResponse } from "next/server";
import { engineFailure } from "@/lib/engines/access";
import { requireJournalOwner } from "@/lib/engines/journal-access";
import { resolveMausbotConfig, MausbotAdapterError } from "../../../../../../../packages/engines/mausbot/src/adapter.mjs";
import { mausbotReleasePermission } from "../../../../../../../packages/engine-core/src/release-gates.mjs";
import { JournalSourceError, readJournalCover } from "../../../../../../../packages/engines/mausbot/src/journal-source.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Owner-only image proxy for MausBot-produced covers (GET /api/attachments/<file>). Bearer never reaches the browser. */
export async function GET(request: NextRequest) {
  const p = request.nextUrl.searchParams;
  if ([...p.keys()].some(k => k !== "workspaceId" && k !== "file") || p.getAll("workspaceId").length !== 1 || p.getAll("file").length !== 1)
    return engineFailure("JOURNAL_QUERY_INVALID", 400);
  const workspaceId = p.get("workspaceId");
  const access = await requireJournalOwner(workspaceId);
  if (!access.ok) return access.response;
  const permission = mausbotReleasePermission(process.env, "read");
  if (!permission.allowed) return engineFailure(permission.code, permission.status);
  try {
    const config = resolveMausbotConfig(process.env, workspaceId);
    if (!config) return engineFailure("MAUSBOT_NOT_CONFIGURED", 503);
    const { body, contentType } = await readJournalCover(config, p.get("file")!);
    return new NextResponse(Buffer.from(body), { headers: { "Content-Type": contentType, "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; sandbox" } });
  } catch (error) {
    if (error instanceof JournalSourceError || error instanceof MausbotAdapterError) return engineFailure(error.code, error.status);
    return engineFailure("JOURNAL_COVER_UNAVAILABLE", 503);
  }
}
