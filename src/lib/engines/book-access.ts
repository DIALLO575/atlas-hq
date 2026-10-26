import { createSupabaseServerClient } from '@/lib/supabase/server';
import { engineFailure } from '@/lib/engines/access';
import { NextResponse } from 'next/server';
type Supa = NonNullable<Awaited<ReturnType<typeof createSupabaseServerClient>>>;
export type BookAccess = { ok: true; supabase: Supa; userId: string } | { ok: false; response: NextResponse };
export async function requireBookOwner(workspaceId: unknown, requestUrl?: string): Promise<BookAccess> {
 if (typeof workspaceId !== 'string' || !/^[0-9a-f-]{36}$/i.test(workspaceId)) return {ok:false,response:engineFailure('INVALID_WORKSPACE_ID',400)};
 const supabase=await createSupabaseServerClient(); if(!supabase) return {ok:false,response:engineFailure('AUTH_UNAVAILABLE',503)};
 const {data:{user},error:authError}=await supabase.auth.getUser();
 if(authError || !user) { const url=new URL('/login',requestUrl ?? 'http://localhost'); url.searchParams.set('next',new URL(requestUrl ?? '/books','http://localhost').pathname); return {ok:false,response:NextResponse.redirect(url,307)}; }
 const {data:member,error}=await supabase.from('workspace_members').select('role').eq('workspace_id',workspaceId).eq('user_id',user.id).maybeSingle();
 if(error) return {ok:false,response:engineFailure('WORKSPACE_UNAVAILABLE',503)};
 if(member?.role!=='owner') return {ok:false,response:engineFailure(member ? 'BOOKS_OWNER_REQUIRED' : 'WORKSPACE_FORBIDDEN',403)};
 return {ok:true,supabase,userId:user.id};
}
