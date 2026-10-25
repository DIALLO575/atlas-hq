import { NextRequest, NextResponse } from "next/server";
import { engineFailure } from "@/lib/engines/access";
import { requireJournalOwner } from "@/lib/engines/journal-access";
import { groupJournal } from "../../../../../../packages/engines/mausbot/src/journal.mjs";
import { JournalSourceError, journalDemoAllowed, readJournalDemo, readJournalFromSupabase } from "../../../../../../packages/engines/mausbot/src/journal-source.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Owner-only read of the latest edition stored in Supabase by n8n. ATLAS never calls MausBot here. */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const workspaceId = params.get("workspaceId");
  if ([...params.keys()].some(k => k !== "workspaceId") || params.getAll("workspaceId").length !== 1)
    return engineFailure("JOURNAL_QUERY_INVALID", 400);
  const access = await requireJournalOwner(workspaceId);
  if (!access.ok) return access.response;
  try {
    const edition = journalDemoAllowed(process.env) ? readJournalDemo() : await readJournalFromSupabase(access.supabase, workspaceId!);
    const { data: states } = await access.supabase.from("feed_item_state").select("item_id,status")
      .eq("workspace_id", workspaceId!).eq("user_id", access.userId).eq("edition_id", edition.editionId);
    const stateMap = Object.fromEntries((states ?? []).map((s: { item_id: string; status: string }) => [s.item_id, s.status]));
    return NextResponse.json({
      source: "supabase-read-only", demo: edition.demo, editionId: edition.editionId, producer: edition.producer,
      generatedAt: edition.generatedAt, coverExpiresAt: edition.coverExpiresAt, categories: groupJournal(edition),
      items: edition.items.map(i => ({ ...i, state: stateMap[i.id] ?? "new" })), stateAvailable: states !== null,
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof JournalSourceError) return engineFailure(error.code, error.status);
    return engineFailure("JOURNAL_UNAVAILABLE", 503);
  }
}
