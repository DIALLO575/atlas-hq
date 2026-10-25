import { NextRequest, NextResponse } from "next/server";
import { engineFailure } from "@/lib/engines/access";
import { requireJournalOwner } from "@/lib/engines/journal-access";
import { resolveMausbotConfig, MausbotAdapterError } from "../../../../../../packages/engines/mausbot/src/adapter.mjs";
import { mausbotReleasePermission } from "../../../../../../packages/engine-core/src/release-gates.mjs";
import { groupJournal } from "../../../../../../packages/engines/mausbot/src/journal.mjs";
import { JournalSourceError, readJournalEdition, resolveJournalSource } from "../../../../../../packages/engines/mausbot/src/journal-source.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";


/** Owner-only, read-only WORLD RADAR edition. GET to MausBot only; reading state comes from Supabase. */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const workspaceId = params.get("workspaceId");
  if ([...params.keys()].some(k => k !== "workspaceId") || params.getAll("workspaceId").length !== 1)
    return engineFailure("JOURNAL_QUERY_INVALID", 400);
  const access = await requireJournalOwner(workspaceId);
  if (!access.ok) return access.response;
  try {
    let config = null;
    if (process.env.ATLAS_MAUSBOT_JOURNAL_DEMO !== "true") {
      const permission = mausbotReleasePermission(process.env, "read");
      if (!permission.allowed) return engineFailure(permission.code, permission.status);
      config = resolveMausbotConfig(process.env, workspaceId);
    }
    const source = resolveJournalSource(process.env, config);
    if (!source) return engineFailure("JOURNAL_SOURCE_NOT_CONFIGURED", 503);
    const edition = await readJournalEdition(source);
    const items = edition.items.slice(0, 40);
    const { data: states } = await access.supabase.from("feed_item_state").select("item_id,status")
      .eq("workspace_id", workspaceId!).eq("user_id", access.userId).eq("edition_id", edition.editionId);
    const stateMap = Object.fromEntries((states ?? []).map((s: { item_id: string; status: string }) => [s.item_id, s.status]));
    return NextResponse.json({
      source: "live-read-only", canDispatch: false, demo: edition.demo, editionId: edition.editionId,
      generatedAt: edition.generatedAt, format: edition.format, categories: groupJournal({ ...edition, items }),
      items: items.map(i => ({ ...i, state: stateMap[i.id] ?? "new" })), stateAvailable: states !== null,
    }, { headers: { "Cache-Control": "private, max-age=60" } });
  } catch (error) {
    if (error instanceof JournalSourceError || error instanceof MausbotAdapterError) return engineFailure(error.code, error.status);
    return engineFailure("JOURNAL_UNAVAILABLE", 503);
  }
}
