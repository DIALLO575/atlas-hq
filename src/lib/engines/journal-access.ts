import { createSupabaseServerClient } from "@/lib/supabase/server";
import { engineFailure, requireEngineWorkspace } from "@/lib/engines/access";
import type { NextResponse } from "next/server";

type Supa = NonNullable<Awaited<ReturnType<typeof createSupabaseServerClient>>>;
export type OwnerAccess = { ok: true; supabase: Supa; userId: string } | { ok: false; response: NextResponse };

/** Journal routes are workspace-owner only (stricter than admin). */
export async function requireJournalOwner(workspaceId: unknown): Promise<OwnerAccess> {
  const access = await requireEngineWorkspace(workspaceId, true);
  if (!access.ok) return access;
  if (access.role !== "owner") return { ok: false, response: engineFailure("JOURNAL_OWNER_REQUIRED", 403) };
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { ok: false, response: engineFailure("AUTH_UNAVAILABLE", 503) };
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, response: engineFailure("AUTH_REQUIRED", 401) };
  return { ok: true, supabase, userId: user.id };
}
