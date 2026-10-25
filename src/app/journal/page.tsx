import { AppShell } from "@/components/app-shell";
import { MorningJournal } from "@/components/morning-journal";
import "../morning-journal.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Journal du matin · ATLAS HQ" };

export default async function JournalPage({ searchParams }: { searchParams: Promise<{ workspaceId?: string }> }) {
  const params = await searchParams;
  return <AppShell><MorningJournal workspaceId={typeof params.workspaceId === "string" ? params.workspaceId : undefined} /></AppShell>;
}
