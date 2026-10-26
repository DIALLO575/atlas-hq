import type { NextRequest } from "next/server";
import { updateSupabaseSession } from "@/lib/supabase/proxy";

export function proxy(request: NextRequest) {
  return updateSupabaseSession(request);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|sw\\.js$|journal-sw-core\\.js$|journal-offline\\.(?:html|js|css)$|journal-offline-cache\\.mjs$|journal-cache-storage\\.mjs$|[a-z]+\\.webmanifest$|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
