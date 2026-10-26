import { NextRequest, NextResponse } from 'next/server';
import { engineFailure, engineSuccess } from '@/lib/engines/access';
import { requireBookOwner } from '@/lib/engines/book-access';
import { isBookUuid, booksEtag, etagMatches } from '../../../../../../../packages/engines/mausbot/src/books.mjs';
export const runtime='nodejs'; export const dynamic='force-dynamic';
const columns='id,book_id,kind,body,position,color,anchor_cfi,created_at,updated_at,deleted_at,send_id';
type NoteBody=Record<string,unknown>;
function validContent(body:NoteBody){return ['note','highlight','bookmark'].includes(String(body.kind))&&typeof body.body==='string'&&body.body.length>=1&&body.body.length<=10000&&typeof body.position==='number'&&Number.isFinite(body.position)&&body.position>=0&&body.position<=1&&['yellow','blue','green','pink'].includes(String(body.color??'yellow'))&&(body.anchorCfi===undefined||body.anchorCfi===null||typeof body.anchorCfi==='string'&&body.anchorCfi.startsWith('epubcfi(')&&body.anchorCfi.length<=4000);}
export async function GET(request:NextRequest){
 const workspaceId=request.nextUrl.searchParams.get('workspaceId'),bookId=request.nextUrl.searchParams.get('bookId');
 if(!isBookUuid(workspaceId)||!isBookUuid(bookId)||[...request.nextUrl.searchParams.keys()].some(k=>!['workspaceId','bookId'].includes(k)))return engineFailure('BOOK_NOTES_INVALID',400);
 const access=await requireBookOwner(workspaceId,request.url);if(!access.ok)return access.response;
 const {data,error}=await access.supabase.from('book_annotations').select(columns).eq('workspace_id',workspaceId).eq('book_id',bookId).eq('user_id',access.userId).order('updated_at',{ascending:false}).limit(500);
 if(error)return engineFailure('BOOK_NOTES_UNAVAILABLE',503);const payload={notes:data??[]};const etag=booksEtag(payload,access.userId,workspaceId);const headers={'Cache-Control':'private, no-store','ETag':etag,'Vary':'Cookie'};
 if(etagMatches(request.headers.get('if-none-match'),etag))return new NextResponse(null,{status:304,headers});return NextResponse.json(payload,{headers});
}
export async function POST(request:NextRequest){
 const body=await request.json().catch(()=>null) as NoteBody|null;if(!body||!isBookUuid(body.workspaceId)||!isBookUuid(body.bookId)||!isBookUuid(body.sendId)||!validContent(body))return engineFailure('BOOK_NOTE_INVALID',400);
 const access=await requireBookOwner(String(body.workspaceId),request.url);if(!access.ok)return access.response;
 const note={workspace_id:body.workspaceId,book_id:body.bookId,user_id:access.userId,send_id:body.sendId,kind:body.kind,body:body.body,position:body.position,color:body.color??'yellow',anchor_cfi:body.anchorCfi??null};
 const {data,error}=await access.supabase.from('book_annotations').insert(note).select(columns).single();
 if(error?.code==='23505'){const {data:prior,error:readError}=await access.supabase.from('book_annotations').select(columns).eq('user_id',access.userId).eq('send_id',body.sendId).maybeSingle();if(readError||!prior)return engineFailure('BOOK_NOTE_UNAVAILABLE',503);if(prior.book_id!==body.bookId||prior.kind!==body.kind||prior.body!==body.body||Number(prior.position)!==body.position||prior.anchor_cfi!==(body.anchorCfi??null)||prior.color!==(body.color??'yellow'))return engineFailure('BOOK_NOTE_SEND_ID_CONFLICT',409);return engineSuccess({note:prior,duplicate:true});}
 if(error)return engineFailure('BOOK_NOTE_UNAVAILABLE',503);return engineSuccess({note:data,duplicate:false},201);
}
export async function PATCH(request:NextRequest){
 const body=await request.json().catch(()=>null) as NoteBody|null;if(!body||!isBookUuid(body.workspaceId)||!isBookUuid(body.bookId)||!isBookUuid(body.id)||!validContent(body))return engineFailure('BOOK_NOTE_INVALID',400);
 const access=await requireBookOwner(String(body.workspaceId),request.url);if(!access.ok)return access.response;
 const {data,error}=await access.supabase.from('book_annotations').update({kind:body.kind,body:body.body,position:body.position,color:body.color??'yellow',anchor_cfi:body.anchorCfi??null,updated_at:new Date().toISOString()}).eq('id',body.id).eq('workspace_id',body.workspaceId).eq('book_id',body.bookId).eq('user_id',access.userId).is('deleted_at',null).select(columns).maybeSingle();
 if(error)return engineFailure('BOOK_NOTE_UNAVAILABLE',503);if(!data)return engineFailure('BOOK_NOTE_NOT_FOUND',404);return engineSuccess({note:data});
}
export async function DELETE(request:NextRequest){
 const body=await request.json().catch(()=>null) as NoteBody|null;if(!body||!isBookUuid(body.workspaceId)||!isBookUuid(body.bookId)||!isBookUuid(body.id))return engineFailure('BOOK_NOTE_INVALID',400);
 const access=await requireBookOwner(String(body.workspaceId),request.url);if(!access.ok)return access.response;const now=new Date().toISOString();
 const {data,error}=await access.supabase.from('book_annotations').update({deleted_at:now,updated_at:now}).eq('id',body.id).eq('workspace_id',body.workspaceId).eq('book_id',body.bookId).eq('user_id',access.userId).is('deleted_at',null).select(columns).maybeSingle();
 if(error)return engineFailure('BOOK_NOTE_UNAVAILABLE',503);if(!data)return engineSuccess({deleted:true,duplicate:true});return engineSuccess({deleted:true,duplicate:false});
}
