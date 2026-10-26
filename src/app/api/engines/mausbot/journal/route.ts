import { NextRequest, NextResponse } from "next/server";
import { engineFailure } from "@/lib/engines/access";
import { requireJournalOwner } from "@/lib/engines/journal-access";
import { groupJournal } from "../../../../../../packages/engines/mausbot/src/journal.mjs";
import { JournalSourceError, journalDemoAllowed, readJournalDemo, readJournalFromSupabase } from "../../../../../../packages/engines/mausbot/src/journal-source.mjs";

import { journalEtag, journalEtagMatches } from "../../../../../../packages/engines/mausbot/src/journal-etag.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Owner-only read of each producer's latest edition stored in Supabase by n8n. ATLAS never calls MausBot here. */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const workspaceId = params.get("workspaceId");
  if ([...params.keys()].some(k => k !== "workspaceId") || params.getAll("workspaceId").length !== 1)
    return engineFailure("JOURNAL_QUERY_INVALID", 400);
  const access = await requireJournalOwner(workspaceId);
  if (!access.ok) return access.response;
  try {
    const edition = journalDemoAllowed(process.env) ? readJournalDemo() : await readJournalFromSupabase(access.supabase, workspaceId!);
    const editionIds = [...new Set(edition.items.map(i => i.editionId))];
    const { data: states } = await access.supabase.from("feed_item_state").select("edition_id,item_id,status,seconds_read,last_position,first_read_at")
      .eq("workspace_id", workspaceId!).eq("user_id", access.userId).in("edition_id", editionIds);
    const stateMap = Object.fromEntries((states ?? []).map((s: { edition_id: string; item_id: string; status: string; seconds_read?: number; last_position?: number | null; first_read_at?: string | null }) => [JSON.stringify([s.edition_id, s.item_id]), s]));
    const payload = {
      source: "supabase-read-only", demo: edition.demo, editionId: edition.editionId, producer: edition.producer,
      generatedAt: edition.generatedAt, receivedAt: edition.receivedAt, editions: edition.editions, coverExpiresAt: edition.coverExpiresAt, categories: groupJournal(edition),
      items: edition.items.map(i => {
        const state = stateMap[i.key];
        return { ...i, state: state?.status ?? "new", secondsRead: state?.seconds_read ?? 0,
          lastPosition: state?.last_position ?? null, firstReadAt: state?.first_read_at ?? null };
      }), stateAvailable: states !== null,
    };
    const etag = journalEtag(payload, access.userId, workspaceId!);
    const headers = { "Cache-Control": "private, no-store", "ETag": etag, "Vary": "Cookie" };
    if (journalEtagMatches(request.headers.get("if-none-match"), etag)) return new NextResponse(null, { status: 304, headers });
    return NextResponse.json(payload, { headers });
  } catch (error) {
    if (error instanceof JournalSourceError) return engineFailure(error.code, error.status);
    return engineFailure("JOURNAL_UNAVAILABLE", 503);
  }
}
