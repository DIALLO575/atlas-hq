import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabasePublicConfig } from "./config";

export async function updateSupabaseSession(request: NextRequest) {
  const config = getSupabasePublicConfig();
  const isLogin = request.nextUrl.pathname === "/login";

  if (!config) {
    if (isLogin) return NextResponse.next();
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("reason", "configuration");
    return NextResponse.redirect(url);
  }

  let response = NextResponse.next({ request });
  const supabase = createServerClient(config.url, config.publishableKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        Object.entries(headers).forEach(([name, value]) => response.headers.set(name, value));
      },
    },
  });

  // Keep this call directly after client creation so refreshed cookies reach the response.
  let claims: { sub?: string } | null = null;
  try {
    const { data, error } = await supabase.auth.getClaims();
    if (!error && data?.claims?.sub) claims = { sub: data.claims.sub };
  } catch {
    if (isLogin) {
      const url = request.nextUrl.clone();
      url.searchParams.set("reason", "auth-unavailable");
      return NextResponse.rewrite(url);
    }
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    url.searchParams.set("reason", "auth-unavailable");
    return NextResponse.redirect(url);
  }
  const isAuthenticated = Boolean(claims?.sub);

  if (isLogin && isAuthenticated) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    const redirect = NextResponse.redirect(url);
    response.cookies.getAll().forEach(({ name, value, ...options }) => redirect.cookies.set(name, value, options));
    response.headers.forEach((value, name) => redirect.headers.set(name, value));
    return redirect;
  }

  if (!isLogin && !isAuthenticated) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    url.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }

  return response;
}
