import { NextRequest } from 'next/server';
import { engineFailure, engineSuccess } from '@/lib/engines/access';
import { requireJournalOwner } from '@/lib/engines/journal-access';
import { validateJournalProgressInput } from '../../../../../../../packages/engines/mausbot/src/journal-source.mjs';
import { recordJournalProgress } from '../../../../../../../packages/engines/mausbot/src/journal-progress.mjs';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function POST(request: NextRequest) {
  if (!(request.headers.get('content-type') ?? '').startsWith('application/json')) return engineFailure('JOURNAL_PROGRESS_INVALID', 415);
  const raw = await request.text();
  if (Buffer.byteLength(raw) > 8192) return engineFailure('JOURNAL_PROGRESS_INVALID', 413);
  let body: unknown;
  try { body = JSON.parse(raw); } catch { return engineFailure('JOURNAL_PROGRESS_INVALID', 400); }
  const input = validateJournalProgressInput(body);
  if (!input) return engineFailure('JOURNAL_PROGRESS_INVALID', 400);
  const access = await requireJournalOwner(input.workspaceId);
  if (!access.ok) return access.response;
  const result = await recordJournalProgress(access.supabase, input);
  return result.ok ? engineSuccess(result) : engineFailure(result.code, result.status);
}
