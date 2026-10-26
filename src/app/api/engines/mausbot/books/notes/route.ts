import { NextRequest, NextResponse } from 'next/server';
import { engineFailure, engineSuccess } from '@/lib/engines/access';
import { requireBookOwner } from '@/lib/engines/book-access';
import { isBookUuid, booksEtag, etagMatches } from '../../../../../../../packages/engines/mausbot/src/books.mjs';
export const runtime='nodejs'; export const dynamic='force-dynamic';
export async function GET(request:NextRequest){
 const workspaceId=request.nextUrl.searchParams.get('workspaceId'),bookId=request.nextUrl.searchParams.get('bookId');
 if(!isBookUuid(workspaceId)||!isBookUuid(bookId)||[...request.nextUrl.searchParams.keys()].some(k=>!['workspaceId','bookId'].includes(k)))return engineFailure('BOOK_NOTES_INVALID',400);
 const access=await requireBookOwner(workspaceId,request.url);if(!access.ok)return access.response;
 const {data,error}=await access.supabase.from('book_annotations').select('id,book_id,kind,body,position,color,anchor_cfi,created_at,updated_at').eq('workspace_id',workspaceId).eq('book_id',bookId).eq('user_id',access.userId).order('updated_at',{ascending:false}).limit(500);
 if(error)return engineFailure('BOOK_NOTES_UNAVAILABLE',503);const payload={notes:data??[]};const etag=booksEtag(payload,access.userId,workspaceId);const headers={'Cache-Control':'private, no-store','ETag':etag,'Vary':'Cookie'};
 if(etagMatches(request.headers.get('if-none-match'),etag))return new NextResponse(null,{status:304,headers});return NextResponse.json(payload,{headers});
}
export async function POST(request:NextRequest){
 const body=await request.json().catch(()=>null);
 if(!body||typeof body!=='object'||!isBookUuid(body.workspaceId)||!isBookUuid(body.bookId)||!['note','highlight'].includes(body.kind)||typeof body.body!=='string'||body.body.length<1||body.body.length>10000||typeof body.position!=='number'||!Number.isFinite(body.position)||body.position<0||body.position>1||!['yellow','blue','green','pink'].includes(body.color??'yellow')||(body.anchorCfi!==undefined&&body.anchorCfi!==null&&(typeof body.anchorCfi!=='string'||!body.anchorCfi.startsWith('epubcfi(')||body.anchorCfi.length>4000)))return engineFailure('BOOK_NOTE_INVALID',400);
 const access=await requireBookOwner(body.workspaceId,request.url);if(!access.ok)return access.response;
 const {data,error}=await access.supabase.from('book_annotations').insert({workspace_id:body.workspaceId,book_id:body.bookId,user_id:access.userId,kind:body.kind,body:body.body,position:body.position,color:body.color??'yellow',anchor_cfi:body.anchorCfi??null}).select('id,book_id,kind,body,position,color,anchor_cfi,created_at,updated_at').single();
 if(error)return engineFailure('BOOK_NOTE_UNAVAILABLE',503);return engineSuccess({note:data},201);
}
