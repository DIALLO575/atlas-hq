import Link from "next/link";
import { Icon } from "@/components/icon";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { journalReadyEvent, normalizeActivity } from "../../packages/engines/mausbot/src/activity-feed.mjs";

/** Read-only activity rows next to needs-you. Journal: latest edition from Supabase (RLS: owner only). Fails silently. */
export async function ActivityFeed({ workspaceId }: { workspaceId: string }) {
  let raw: unknown[] = [];
  try {
    const supabase = await createSupabaseServerClient();
    if (!supabase) return null;
    const { data } = await supabase.from("journal_editions").select("edition_id,item_count,generated_at")
      .eq("workspace_id", workspaceId).order("generated_at", { ascending: false }).limit(1).maybeSingle();
    raw = [journalReadyEvent(workspaceId, data)];
  } catch { raw = []; }
  const events = normalizeActivity(raw);
  if (!events.length) return null;
  return <section className="atlas-activity-feed" aria-label="Activité">
    {events.map(e => <Link key={e.id} href={e.href} className={"atlas-activity-row is-" + e.type}>
      <span className="atlas-activity-icon" aria-hidden><Icon name="activity" /></span>
      <span className="atlas-activity-text"><strong>{e.title}</strong>
        {e.at && <small>{new Intl.DateTimeFormat("fr-FR", { weekday: "long", hour: "2-digit", minute: "2-digit", timeZone: "America/Los_Angeles" }).format(new Date(e.at))}</small>}</span>
      <Icon name="arrow-right" />
    </Link>)}
  </section>;
}
