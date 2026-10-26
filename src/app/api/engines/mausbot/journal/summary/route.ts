import { NextRequest } from 'next/server';
import { engineFailure, engineSuccess } from '@/lib/engines/access';
import { requireJournalOwner } from '@/lib/engines/journal-access';
import { readJournalSummary } from '../../../../../../../packages/engines/mausbot/src/journal-progress.mjs';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  if ([...params.keys()].some(k => k !== 'workspaceId') || params.getAll('workspaceId').length !== 1) return engineFailure('JOURNAL_QUERY_INVALID', 400);
  const workspaceId = params.get('workspaceId');
  const access = await requireJournalOwner(workspaceId);
  if (!access.ok) return access.response;
  try { return engineSuccess(await readJournalSummary(access.supabase, workspaceId!, access.userId)); }
  catch { return engineFailure('JOURNAL_SUMMARY_UNAVAILABLE', 503); }
}
