import { NextRequest, NextResponse } from 'next/server';
import { engineFailure, engineSuccess } from '@/lib/engines/access';
import { requireBookOwner } from '@/lib/engines/book-access';
import { booksEtag, etagMatches } from '../../../../../../../packages/engines/mausbot/src/books.mjs';
import { calculateBooksSummary } from '../../../../../../../packages/engines/mausbot/src/books-summary.mjs';
export const runtime='nodejs'; export const dynamic='force-dynamic';
const DAY=86400000;
export async function GET(request:NextRequest){
 const workspaceId=request.nextUrl.searchParams.get('workspaceId');if(!workspaceId||[...request.nextUrl.searchParams.keys()].some(k=>k!=='workspaceId'))return engineFailure('BOOKS_QUERY_INVALID',400);
 const access=await requireBookOwner(workspaceId,request.url);if(!access.ok)return access.response;
 const today=new Date().toISOString().slice(0,10),start=new Date(Date.parse(`${today}T00:00:00Z`)-364*DAY).toISOString().slice(0,10);
 const [{data:books,error:be},{data:sessions,error:se},{data:preferences,error:pe}]=await Promise.all([
  access.supabase.from('books').select('id,status,book_reading_state(position,pages_read,finished_at)').eq('workspace_id',workspaceId).eq('owner_id',access.userId),
  access.supabase.from('book_reading_sessions').select('day,seconds').eq('workspace_id',workspaceId).eq('user_id',access.userId).gte('day',start).lte('day',today).limit(20000),
  access.supabase.from('book_user_preferences').select('daily_goal_minutes').eq('workspace_id',workspaceId).eq('user_id',access.userId).maybeSingle()
 ]);if(be||se||pe)return engineFailure('BOOKS_SUMMARY_UNAVAILABLE',503);
 const payload=calculateBooksSummary({today,sessions:sessions??[],books:books??[],goalMinutes:preferences?.daily_goal_minutes??30});
 const etag=booksEtag(payload,access.userId,workspaceId),headers={'Cache-Control':'private, no-store','ETag':etag,'Vary':'Cookie'};if(etagMatches(request.headers.get('if-none-match'),etag))return new NextResponse(null,{status:304,headers});return NextResponse.json(payload,{headers});
}
export async function PATCH(request:NextRequest){
 const body=await request.json().catch(()=>null);if(!body||typeof body.workspaceId!=='string'||!Number.isInteger(body.goalMinutes)||body.goalMinutes<5||body.goalMinutes>360)return engineFailure('BOOKS_GOAL_INVALID',400);
 const access=await requireBookOwner(body.workspaceId,request.url);if(!access.ok)return access.response;
 const {error}=await access.supabase.from('book_user_preferences').upsert({workspace_id:body.workspaceId,user_id:access.userId,daily_goal_minutes:body.goalMinutes,updated_at:new Date().toISOString()},{onConflict:'workspace_id,user_id'});if(error)return engineFailure('BOOKS_GOAL_UNAVAILABLE',503);return engineSuccess({goalMinutes:body.goalMinutes});
}
