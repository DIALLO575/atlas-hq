import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { safeInternalPath } from "@/lib/auth/email-redirect";
import { getSupabasePublicConfig } from "@/lib/supabase/config";

export async function GET(request: NextRequest) {
  const destination = safeInternalPath(request.nextUrl.searchParams.get("next") ?? "");
  const code = request.nextUrl.searchParams.get("code");
  const failure = request.nextUrl.clone();
  failure.pathname = "/login";
  failure.search = "";
  failure.searchParams.set("reason", "auth-callback");

  const config = getSupabasePublicConfig();
  if (!code || !config) return NextResponse.redirect(failure);

  const successUrl = new URL(destination, request.url);
  let response = NextResponse.redirect(successUrl);
  const supabase = createServerClient(config.url, config.publishableKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.redirect(successUrl);
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        Object.entries(headers).forEach(([name, value]) => response.headers.set(name, value));
      },
    },
  });

  try {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) return NextResponse.redirect(failure);
  } catch {
    return NextResponse.redirect(failure);
  }
  return response;
}
