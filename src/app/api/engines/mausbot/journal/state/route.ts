import { NextRequest } from "next/server";
import { engineFailure, engineSuccess } from "@/lib/engines/access";
import { requireJournalOwner } from "@/lib/engines/journal-access";
import { validateJournalStateInput } from "../../../../../../../packages/engines/mausbot/src/journal-source.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Writes the owner's reading state to Supabase (feed_item_state). Never writes to MausBot. */
export async function POST(request: NextRequest) {
  if (!(request.headers.get("content-type") ?? "").startsWith("application/json")) return engineFailure("JOURNAL_STATE_INVALID", 415);
  const raw = await request.text();
  if (raw.length > 2048) return engineFailure("JOURNAL_STATE_INVALID", 413);
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { return engineFailure("JOURNAL_STATE_INVALID", 400); }
  const input = validateJournalStateInput(parsed);
  if (!input) return engineFailure("JOURNAL_STATE_INVALID", 400);
  const access = await requireJournalOwner(input.workspaceId);
  if (!access.ok) return access.response;
  const { error } = await access.supabase.from("feed_item_state").upsert({
    user_id: access.userId, workspace_id: input.workspaceId, edition_id: input.editionId,
    item_id: input.itemId, status: input.status, updated_at: new Date().toISOString(),
  }, { onConflict: "user_id,workspace_id,edition_id,item_id" });
  if (error) return engineFailure("JOURNAL_STATE_UNAVAILABLE", 503);
  return engineSuccess({ ok: true, itemId: input.itemId, status: input.status });
}
