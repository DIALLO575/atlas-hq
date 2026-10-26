import { NextRequest, NextResponse } from 'next/server';
import { engineFailure, engineSuccess } from '@/lib/engines/access';
import { requireBookOwner } from '@/lib/engines/book-access';
import { isBookUuid } from '../../../../../../../../packages/engines/mausbot/src/books.mjs';
export const runtime='nodejs'; export const dynamic='force-dynamic';
type Context={params:Promise<{id:string}>};
const coverPrefix=(workspaceId:string,id:string)=>`${workspaceId}/${id}/covers/`;
export async function POST(request:NextRequest,{params}:Context){
 const {id}=await params;const body=await request.json().catch(()=>null);
 if(!isBookUuid(id)||!body||!isBookUuid(body.workspaceId))return engineFailure('BOOK_COVER_INVALID',400);
 const access=await requireBookOwner(body.workspaceId,request.url);if(!access.ok)return access.response;
 const {data:book,error}=await access.supabase.from('books').select('id').eq('id',id).eq('workspace_id',body.workspaceId).eq('owner_id',access.userId).maybeSingle();
 if(error)return engineFailure('BOOK_COVER_UNAVAILABLE',503);if(!book)return engineFailure('BOOK_NOT_FOUND',404);
 if(body.finalize===true){
  const {data:existing,error:listError}=await access.supabase.storage.from('books').list(coverPrefix(body.workspaceId,id));
  if(listError)return engineFailure('BOOK_COVER_UNAVAILABLE',503);
  const nonce=typeof body.coverPath==='string'?/^cover-([a-f0-9-]{36})\.webp$/.exec(body.coverPath.split('/').at(-1)??'')?.[1]:null;
  const thumbNonce=typeof body.thumbPath==='string'?/^thumb-([a-f0-9-]{36})\.webp$/.exec(body.thumbPath.split('/').at(-1)??'')?.[1]:null;
  const coverPath=body.coverPath,thumbPath=body.thumbPath;
  const coverObject=(existing??[]).find(x=>x.name===coverPath?.split('/').at(-1));const thumbObject=(existing??[]).find(x=>x.name===thumbPath?.split('/').at(-1));
  const coverMeta=coverObject?.metadata as {size?:number|string;mimetype?:string}|null;const thumbMeta=thumbObject?.metadata as {size?:number|string;mimetype?:string}|null;
  if(!nonce||nonce!==thumbNonce||!coverPath.startsWith(coverPrefix(body.workspaceId,id))||!thumbPath.startsWith(coverPrefix(body.workspaceId,id))
    ||!coverMeta||!thumbMeta||!Number.isFinite(Number(coverMeta.size))||!Number.isFinite(Number(thumbMeta.size))||Number(coverMeta.size)<1||Number(thumbMeta.size)<1||Number(coverMeta.size)>2*1024*1024||Number(thumbMeta.size)>256*1024||coverMeta.mimetype!=='image/webp'||thumbMeta.mimetype!=='image/webp')return engineFailure('BOOK_COVER_UPLOAD_INCOMPLETE',400);
  const {data:old}=await access.supabase.from('books').select('cover_path,cover_thumb_path').eq('id',id).single();
  const {error:updateError}=await access.supabase.from('books').update({cover_path:coverPath,cover_thumb_path:thumbPath,updated_at:new Date().toISOString()}).eq('id',id).eq('workspace_id',body.workspaceId).eq('owner_id',access.userId);
  if(updateError)return engineFailure('BOOK_COVER_UNAVAILABLE',503);
  const remove=[old?.cover_path,old?.cover_thumb_path].filter((x):x is string=>Boolean(x)&&x!==coverPath&&x!==thumbPath);
  if(remove.length)await access.supabase.storage.from('books').remove(remove);
  return engineSuccess({saved:true});
 }
 const nonce=crypto.randomUUID();const coverPath=`${coverPrefix(body.workspaceId,id)}cover-${nonce}.webp`,thumbPath=`${coverPrefix(body.workspaceId,id)}thumb-${nonce}.webp`;
 const [cover,thumb]=await Promise.all([access.supabase.storage.from('books').createSignedUploadUrl(coverPath),access.supabase.storage.from('books').createSignedUploadUrl(thumbPath)]);
 if(cover.error||thumb.error||!cover.data||!thumb.data)return engineFailure('BOOK_COVER_UNAVAILABLE',503);
 return NextResponse.json({cover:{path:coverPath,token:cover.data.token},thumb:{path:thumbPath,token:thumb.data.token}},{headers:{'Cache-Control':'private, no-store','Vary':'Cookie'}});
}
export async function GET(request:NextRequest,{params}:Context){
 const {id}=await params;const workspaceId=request.nextUrl.searchParams.get('workspaceId');if(!isBookUuid(id)||!isBookUuid(workspaceId))return engineFailure('BOOK_QUERY_INVALID',400);
 const access=await requireBookOwner(workspaceId,request.url);if(!access.ok)return access.response;
 const {data:book,error}=await access.supabase.from('books').select('cover_path,cover_thumb_path').eq('id',id).eq('workspace_id',workspaceId).eq('owner_id',access.userId).maybeSingle();
 if(error)return engineFailure('BOOK_COVER_UNAVAILABLE',503);if(!book)return engineFailure('BOOK_NOT_FOUND',404);
 const [cover,thumb]=await Promise.all([book.cover_path?access.supabase.storage.from('books').createSignedUrl(book.cover_path,300):Promise.resolve({data:null,error:null}),book.cover_thumb_path?access.supabase.storage.from('books').createSignedUrl(book.cover_thumb_path,300):Promise.resolve({data:null,error:null})]);
 if(cover.error||thumb.error)return engineFailure('BOOK_COVER_UNAVAILABLE',503);
 return NextResponse.json({path:book.cover_thumb_path,coverUrl:cover.data?.signedUrl??null,thumbUrl:thumb.data?.signedUrl??null},{headers:{'Cache-Control':'private, no-store','Vary':'Cookie'}});
}
export async function DELETE(request:NextRequest,{params}:Context){
 const {id}=await params;const workspaceId=request.nextUrl.searchParams.get('workspaceId');if(!isBookUuid(id)||!isBookUuid(workspaceId))return engineFailure('BOOK_QUERY_INVALID',400);
 const access=await requireBookOwner(workspaceId,request.url);if(!access.ok)return access.response;
 const {data:book,error}=await access.supabase.from('books').select('cover_path,cover_thumb_path').eq('id',id).eq('workspace_id',workspaceId).eq('owner_id',access.userId).maybeSingle();
 if(error)return engineFailure('BOOK_COVER_UNAVAILABLE',503);if(!book)return engineFailure('BOOK_NOT_FOUND',404);
 const paths=[book.cover_path,book.cover_thumb_path].filter((x):x is string=>Boolean(x));if(paths.length){const {error:removeError}=await access.supabase.storage.from('books').remove(paths);if(removeError)return engineFailure('BOOK_COVER_UNAVAILABLE',503);}
 const {error:updateError}=await access.supabase.from('books').update({cover_path:null,cover_thumb_path:null,updated_at:new Date().toISOString()}).eq('id',id).eq('workspace_id',workspaceId).eq('owner_id',access.userId);
 if(updateError)return engineFailure('BOOK_COVER_UNAVAILABLE',503);return engineSuccess({removed:true});
}
