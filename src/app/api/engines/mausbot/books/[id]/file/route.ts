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
 if(signError||!data)return engineFailure('BOOK_FILE_UNAVAILABLE',503);
 return NextResponse.json({url:data.signedUrl,format:book.format},{headers:{'Cache-Control':'private, no-store','Vary':'Cookie'}});
}
