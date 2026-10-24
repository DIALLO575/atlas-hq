import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { Icon } from "@/components/icon";
import { readAtlasWorkflow } from "@/lib/atlas-workflow";
import { buildChiefReply } from "@/lib/chief/briefing";
import { ChiefCommandDeck } from "@/components/chief-command-deck";

export const dynamic = "force-dynamic";

export default async function ChiefPage({
  searchParams,
}: { searchParams: Promise<{workspaceId?: string; prompt?: string}> }) {
  const params = await searchParams;
  const data = await readAtlasWorkflow(params.workspaceId);
  const initialPrompt = params.prompt?.trim().slice(0,700) || "Fais le point sur mes missions";
  return <AppShell><main className="main-content atlas-chief-command-page" id="main-content">
    {data.status === "error" ? <section className="atlas-chief-error" role="alert">
      <Icon name="spark"/><div><h1>Chief indisponible</h1><p>{data.message}</p>
        <Link href="/chief">Réessayer <Icon name="arrow-right"/></Link></div>
    </section> : !data.selected ? <section className="atlas-chief-empty">
      <Icon name="layers"/><h1>Préparez votre espace Chief</h1>
      <p>Créez un workspace pour obtenir un briefing sur vos missions et validations réelles.</p>
      <Link href="/workspaces">Créer un workspace <Icon name="arrow-right"/></Link>
    </section> : <ChiefCommandDeck key={data.selected.id}
      workspace={data.selected}
      workspaces={data.spaces}
      initialReply={buildChiefReply(initialPrompt,data.selected.name,
        data.missions,data.reviews,data.userId,data.selected.role === "owner" || data.selected.role === "admin")}/>}
  </main></AppShell>;
}
