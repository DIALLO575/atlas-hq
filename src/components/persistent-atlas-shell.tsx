"use client";

import { usePathname } from "next/navigation";
import { AppShellFrame } from "@/components/app-shell";

/** One persistent dock instance for every authenticated dashboard route.
 * Page-level AppShell wrappers become no-ops via the context in AppShellFrame.
 * Keeping this outside route pages prevents remount/re-measure on every click.
 */
export function PersistentAtlasShell({ children }: Readonly<{ children: React.ReactNode }>) {
  const pathname = usePathname();
  // Preserve the standalone authentication experience, including its theme.
  if (pathname === "/login" || pathname?.startsWith("/login/")) {
    return <>{children}</>;
  }
  return <AppShellFrame>{children}</AppShellFrame>;
}
