import { NextRequest, NextResponse } from 'next/server';
import { engineFailure, engineSuccess } from '@/lib/engines/access';
import { requireBookOwner } from '@/lib/engines/book-access';
import { isBookUuid } from '../../../../../../../../packages/engines/mausbot/src/books.mjs';
export const runtime='nodejs'; export const dynamic='force-dynamic';
type Context={params:Promise<{id:string}>};
const MIME_BY_FORMAT={epub:'application/epub+zip',pdf:'application/pdf'} as const;
const validSize=(value:unknown)=>Number.isSafeInteger(value)&&Number(value)>=1&&Number(value)<=104857600;
const filePrefix=(workspaceId:string,id:string)=>`${workspaceId}/${id}/`;
const objectName=(path:string)=>path.split('/').at(-1)??'';
async function ownedBook(access:Awaited<ReturnType<typeof requireBookOwner>> & {ok:true},workspaceId:string,id:string){
 const {data,error}=await access.supabase.from('books').select('format,book_files(id,storage_path,mime_type,byte_size)').eq('id',id).eq('workspace_id',workspaceId).eq('owner_id',access.userId).maybeSingle();
 const file=Array.isArray(data?.book_files)?data.book_files[0]:data?.book_files;
 return {book:data,file,error};
}
export async function GET(request:NextRequest,{params}:Context){
 const {id}=await params;const workspaceId=request.nextUrl.searchParams.get('workspaceId');
 if(!isBookUuid(id)||!isBookUuid(workspaceId)||[...request.nextUrl.searchParams.keys()].some(k=>k!=='workspaceId'))return engineFailure('BOOK_QUERY_INVALID',400);
 const access=await requireBookOwner(workspaceId,request.url);if(!access.ok)return access.response;
 const {book,file,error}=await ownedBook(access,workspaceId,id);
 if(error)return engineFailure('BOOK_FILE_UNAVAILABLE',503);if(!book||!file)return engineFailure('BOOK_NOT_FOUND',404);
 const {data:objects,error:listError}=await access.supabase.storage.from('books').list(filePrefix(workspaceId,id));
 if(listError)return engineFailure('BOOK_FILE_UNAVAILABLE',503);
 if(!(objects??[]).some(item=>item.name===objectName(file.storage_path)))return engineFailure('BOOK_FILE_MISSING',409);
 const {data,error:signError}=await access.supabase.storage.from('books').createSignedUrl(file.storage_path,300);
 if(signError||!data)return engineFailure('BOOK_FILE_UNAVAILABLE',503);
 return NextResponse.json({url:data.signedUrl,format:book.format},{headers:{'Cache-Control':'private, no-store','Vary':'Cookie'}});
}
export async function POST(request:NextRequest,{params}:Context){
 const {id}=await params;if(!(request.headers.get('content-type')??'').startsWith('application/json'))return engineFailure('BOOK_FILE_INVALID',415);
 let body:unknown;try{body=JSON.parse(await request.text())}catch{return engineFailure('BOOK_FILE_INVALID',400)}
 if(!body||typeof body!=='object'||Array.isArray(body)||!isBookUuid((body as {workspaceId?:unknown}).workspaceId)||!isBookUuid(id))return engineFailure('BOOK_FILE_INVALID',400);
 const input=body as {workspaceId:string;action?:unknown;mimeType?:unknown;byteSize?:unknown;path?:unknown};if((input.action!=='prepare'&&input.action!=='finalize')||typeof input.mimeType!=='string'||!validSize(input.byteSize))return engineFailure('BOOK_FILE_INVALID',400);
 const access=await requireBookOwner(input.workspaceId,request.url);if(!access.ok)return access.response;
 const {book,file,error}=await ownedBook(access,input.workspaceId,id);if(error)return engineFailure('BOOK_FILE_UNAVAILABLE',503);if(!book||!file)return engineFailure('BOOK_NOT_FOUND',404);
 if(input.mimeType!==MIME_BY_FORMAT[book.format as keyof typeof MIME_BY_FORMAT])return engineFailure('BOOK_FILE_INVALID',400);
 if(input.action==='prepare'){
  const path=`${filePrefix(input.workspaceId,id)}${crypto.randomUUID()}.${book.format}`;
  const {data,error:uploadError}=await access.supabase.storage.from('books').createSignedUploadUrl(path);
  if(uploadError||!data)return engineFailure('BOOK_UPLOAD_UNAVAILABLE',503);
  return NextResponse.json({upload:{path,token:data.token}},{headers:{'Cache-Control':'private, no-store','Vary':'Cookie'}});
 }
 if(typeof input.path!=='string'||!input.path.startsWith(filePrefix(input.workspaceId,id))||!input.path.endsWith(`.${book.format}`))return engineFailure('BOOK_FILE_INVALID',400);
 const path=input.path,mimeType=input.mimeType,byteSize=input.byteSize;
 const {data:objects,error:listError}=await access.supabase.storage.from('books').list(filePrefix(input.workspaceId,id));if(listError)return engineFailure('BOOK_FILE_UNAVAILABLE',503);
 const object=(objects??[]).find(item=>item.name===objectName(path));const meta=object?.metadata as {size?:number|string;mimetype?:string}|null;
 if(!meta||Number(meta.size)!==byteSize||meta.mimetype!==mimeType)return engineFailure('BOOK_FILE_UPLOAD_INCOMPLETE',400);
 const {error:updateError}=await access.supabase.from('book_files').update({storage_path:path,mime_type:mimeType,byte_size:byteSize}).eq('id',file.id).eq('workspace_id',input.workspaceId).eq('book_id',id);
 if(updateError)return engineFailure('BOOK_FILE_UNAVAILABLE',503);
 if(file.storage_path!==path)await access.supabase.storage.from('books').remove([file.storage_path]);
 return engineSuccess({saved:true});
}
