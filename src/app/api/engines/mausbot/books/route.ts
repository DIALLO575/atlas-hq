import { NextRequest, NextResponse } from 'next/server';
import { engineFailure, engineSuccess } from '@/lib/engines/access';
import { requireBookOwner } from '@/lib/engines/book-access';
import { validateCreateBook, booksEtag, etagMatches } from '../../../../../../packages/engines/mausbot/src/books.mjs';
export const runtime='nodejs'; export const dynamic='force-dynamic';
export async function GET(request:NextRequest) {
 const workspaceId=request.nextUrl.searchParams.get('workspaceId');
 if([...request.nextUrl.searchParams.keys()].some(k=>k!=='workspaceId')||request.nextUrl.searchParams.getAll('workspaceId').length!==1)return engineFailure('BOOKS_QUERY_INVALID',400);
 const access=await requireBookOwner(workspaceId,request.url); if(!access.ok)return access.response;
 const {data,error}=await access.supabase.from('books').select('id,title,author,format,status,cover_path,cover_thumb_path,created_at,updated_at,book_reading_state(position,pages_read,finished_at,client_updated_at,device_id),book_files(id,mime_type,byte_size)').eq('workspace_id',workspaceId!).eq('owner_id',access.userId).order('updated_at',{ascending:false}).limit(200);
 if(error)return engineFailure('BOOKS_UNAVAILABLE',503);
 const payload={books:data??[]}; const etag=booksEtag(payload,access.userId,workspaceId!); const headers={'Cache-Control':'private, no-store','ETag':etag,'Vary':'Cookie'};
 if(etagMatches(request.headers.get('if-none-match'),etag))return new NextResponse(null,{status:304,headers}); return NextResponse.json(payload,{headers});
}
export async function POST(request:NextRequest) {
 if(!(request.headers.get('content-type')??'').startsWith('application/json'))return engineFailure('BOOK_INVALID',415);
 let raw:string; try{raw=await request.text()}catch{return engineFailure('BOOK_INVALID',400)} if(Buffer.byteLength(raw)>4096)return engineFailure('BOOK_INVALID',413);
 let body:unknown; try{body=JSON.parse(raw)}catch{return engineFailure('BOOK_INVALID',400)} const input=validateCreateBook(body); if(!input)return engineFailure('BOOK_INVALID',400);
 const access=await requireBookOwner(input.workspaceId,request.url); if(!access.ok)return access.response;
 const {data:book,error}=await access.supabase.from('books').insert({workspace_id:input.workspaceId,owner_id:access.userId,title:input.title,author:input.author,format:input.format}).select('id,title,author,format,status,created_at').single();
 if(error||!book)return engineFailure('BOOK_CREATE_UNAVAILABLE',503);
 const path=`${input.workspaceId}/${book.id}/${crypto.randomUUID()}.${input.format}`;
 const {data:file,error:fileError}=await access.supabase.from('book_files').insert({workspace_id:input.workspaceId,book_id:book.id,storage_path:path,mime_type:input.mimeType,byte_size:input.byteSize}).select('id').single();
 if(fileError||!file){await access.supabase.from('books').delete().eq('id',book.id).eq('workspace_id',input.workspaceId);return engineFailure('BOOK_FILE_CREATE_UNAVAILABLE',503)}
 const {data:upload,error:uploadError}=await access.supabase.storage.from('books').createSignedUploadUrl(path);
 if(uploadError||!upload){await access.supabase.from('books').delete().eq('id',book.id).eq('workspace_id',input.workspaceId);return engineFailure('BOOK_UPLOAD_UNAVAILABLE',503)}
 return engineSuccess({book,fileId:file.id,upload:{signedUrl:upload.signedUrl,token:upload.token,path}},201);
}
