import { NextRequest, NextResponse } from 'next/server';
import { engineFailure } from '@/lib/engines/access';
import { requireBookOwner } from '@/lib/engines/book-access';
import { isBookUuid } from '../../../../../../../../packages/engines/mausbot/src/books.mjs';
export const runtime='nodejs'; export const dynamic='force-dynamic';
type Context={params:Promise<{id:string}>};
export async function GET(request:NextRequest,{params}:Context){
 const {id}=await params;const workspaceId=request.nextUrl.searchParams.get('workspaceId');
 if(!isBookUuid(id)||!isBookUuid(workspaceId)||[...request.nextUrl.searchParams.keys()].some(k=>k!=='workspaceId'))return engineFailure('BOOK_QUERY_INVALID',400);
 const access=await requireBookOwner(workspaceId,request.url);if(!access.ok)return access.response;
 const {data:book,error}=await access.supabase.from('books').select('format,book_files(storage_path)').eq('id',id).eq('workspace_id',workspaceId).eq('owner_id',access.userId).maybeSingle();
 const file=Array.isArray(book?.book_files)?book.book_files[0]:book?.book_files;
 if(error)return engineFailure('BOOK_FILE_UNAVAILABLE',503);if(!book||!file)return engineFailure('BOOK_NOT_FOUND',404);
 const {data,error:signError}=await access.supabase.storage.from('books').createSignedUrl(file.storage_path,300);
 if(signError||!data){const failure=signError as {code?:string;message?:string}|null;
 const missing=failure?.code==='NoSuchKey'||failure?.code==='not_found'||failure?.message?.toLowerCase().includes('object not found');
 return engineFailure(missing?'BOOK_FILE_MISSING':'BOOK_FILE_UNAVAILABLE',missing?409:503);}
 return NextResponse.json({url:data.signedUrl,format:book.format},{headers:{'Cache-Control':'private, no-store','Vary':'Cookie'}});
}

/** Authenticated, bounded rescue upload; the client never supplies a storage path. */
export async function POST(request:NextRequest,{params}:Context){
 const {id}=await params,workspaceId=request.nextUrl.searchParams.get('workspaceId');
 if(!isBookUuid(id)||!isBookUuid(workspaceId)||request.nextUrl.searchParams.getAll('workspaceId').length!==1
   ||[...request.nextUrl.searchParams.keys()].some(k=>k!=='workspaceId'))return engineFailure('BOOK_QUERY_INVALID',400);
 const access=await requireBookOwner(workspaceId,request.url);if(!access.ok)return access.response;
 if(!(request.headers.get('content-type')??'').startsWith('multipart/form-data'))return engineFailure('BOOK_UPLOAD_INVALID',415);
 const length=Number(request.headers.get('content-length'));
 if(Number.isFinite(length)&&length>4000000)return engineFailure('BOOK_UPLOAD_TOO_LARGE',413);
 const form=await request.formData().catch(()=>null),file=form?.get('file');
 if(!form||[...form.keys()].some(k=>k!=='file')||!(file instanceof File)||file.size<5||file.size>3800000)return engineFailure('BOOK_UPLOAD_INVALID',422);
 const {data:book,error}=await access.supabase.from('books').select('format,book_files(storage_path,mime_type,byte_size)')
   .eq('id',id).eq('workspace_id',workspaceId).eq('owner_id',access.userId).maybeSingle();
 if(error)return engineFailure('BOOK_FILE_UNAVAILABLE',503);
 const record=Array.isArray(book?.book_files)?book.book_files[0]:book?.book_files;
 if(!book||!record)return engineFailure('BOOK_NOT_FOUND',404);
 const mime=book.format==='pdf'?'application/pdf':'application/epub+zip';
 if(!['pdf','epub'].includes(book.format)||record.mime_type!==mime
   ||!record.storage_path.startsWith(workspaceId+'/'+id+'/')
   ||!record.storage_path.endsWith('.'+book.format))return engineFailure('BOOK_FILE_INVALID',422);
 const bytes=new Uint8Array(await file.arrayBuffer());
 const signature=book.format==='pdf'?bytes[0]===37&&bytes[1]===80&&bytes[2]===68&&bytes[3]===70&&bytes[4]===45
   :bytes[0]===80&&bytes[1]===75&&bytes[2]===3&&bytes[3]===4;
 if(!signature||bytes.byteLength!==Number(record.byte_size))return engineFailure('BOOK_FILE_MISMATCH',422);
 const {error:uploadError}=await access.supabase.storage.from('books').upload(record.storage_path,bytes,{contentType:mime,cacheControl:'3600',upsert:false});
 if(uploadError){
  const text=uploadError.message.toLowerCase();
  if(text.includes('already exists')||text.includes('duplicate'))return engineFailure('BOOK_FILE_ALREADY_PRESENT',409);
  return engineFailure('BOOK_UPLOAD_UNAVAILABLE',503);
 }
 return NextResponse.json({uploaded:true},{headers:{'Cache-Control':'private, no-store','Vary':'Cookie'}});
}
