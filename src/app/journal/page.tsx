import type { Metadata, Viewport } from "next";
import { AppShell } from "@/components/app-shell";
import { MorningJournal } from "@/components/morning-journal";
import "../morning-journal.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Journal du matin · ATLAS HQ",
  manifest: "/journal.webmanifest",
  appleWebApp: { capable: true, title: "Journal", statusBarStyle: "black-translucent" },
};
export const viewport: Viewport = {
  width: "device-width", initialScale: 1, viewportFit: "cover",
  themeColor: [{ media: "(prefers-color-scheme: light)", color: "#f7f3ea" }, { media: "(prefers-color-scheme: dark)", color: "#14130f" }],
};

export default async function JournalPage({ searchParams }: { searchParams: Promise<{ workspaceId?: string }> }) {
  const params = await searchParams;
  return <AppShell><MorningJournal workspaceId={typeof params.workspaceId === "string" ? params.workspaceId : undefined} /></AppShell>;
}
