import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { EmptyPanel, PageHeading } from "@/components/page-elements";
import { Icon } from "@/components/icon";
import { readAtlasWorkflow } from "@/lib/atlas-workflow";

export const dynamic = "force-dynamic";

type Query = { q?: string; workspaceId?: string };
export default async function SearchPage({ searchParams }: { searchParams: Promise<Query> }) {
  const params = await searchParams;
  const query = (params.q ?? "").trim().slice(0, 100);
  const data = await readAtlasWorkflow(params.workspaceId);
  const normalized = query.toLocaleLowerCase("fr");
  const results = data.status === "ready" && data.selected && normalized
    ? data.missions.filter((mission) =>
      (mission.title + " " + mission.description).toLocaleLowerCase("fr").includes(normalized))
    : [];
  return <AppShell><main className="main-content" id="main-content">
    <PageHeading eyebrow="RETROUVER" title="Recherche" description="Recherchez les missions réelles de votre workspace. Aucun résultat de démonstration." />
    {data.status === "error" ? <section role="alert"><EmptyPanel title="Recherche indisponible">{data.message}</EmptyPanel></section>
      : !data.selected ? <EmptyPanel title="Aucun workspace accessible">Créez un workspace ou demandez l’accès à un espace pour rechercher ses missions.</EmptyPanel>
      : <>
        <form className="search-form" role="search" method="get" action="/search">
          <Icon name="search" />
          <input type="hidden" name="workspaceId" value={data.selected.id} />
          <label className="sr-only" htmlFor="atlas-search">Rechercher une mission</label>
          <input id="atlas-search" name="q" type="search" placeholder="Rechercher une mission…" defaultValue={query} maxLength={100} autoComplete="off" />
          <button type="submit">Rechercher</button>
        </form>
        <nav aria-label="Choisir le workspace">
          {data.spaces.map((workspace) => <Link key={workspace.id}
            href={"/search?workspaceId=" + encodeURIComponent(workspace.id) + "&q=" + encodeURIComponent(query)}
            aria-current={workspace.id === data.selected?.id ? "page" : undefined}>{workspace.name}</Link>)}
        </nav>
        <section className="search-results" aria-label="Résultats de recherche" aria-live="polite">
          {!query ? <EmptyPanel title="Que souhaitez-vous retrouver ?" icon="search">Saisissez un terme. La recherche porte uniquement sur les missions visibles de « {data.selected.name} » (200 dernières au maximum).</EmptyPanel>
          : results.length ? <><p className="results-count">{results.length} résultat{results.length > 1 ? "s" : ""} parmi les missions chargées</p>
            <ul className="results-list">{results.map((mission) => <li key={mission.id}>
              <Link href={"/missions?workspaceId=" + encodeURIComponent(mission.workspaceId) + "&missionId=" + encodeURIComponent(mission.id)}>
                <span className="result-icon"><Icon name="layers" /></span>
                <span><strong>{mission.title}</strong><small>{mission.description || "Aucune description"}</small></span>
                <span className="result-type">Mission</span><Icon name="arrow-up-right" />
              </Link></li>)}</ul></>
          : <EmptyPanel title="Aucune mission correspondante" icon="search">Aucune mission visible ne correspond à « {query} » dans cet espace. Vérifiez un autre terme ou un autre workspace.</EmptyPanel>}
          {data.missions.length === 200 && <p>Résultats limités aux 200 missions récentes chargées dans cet espace.</p>}
        </section>
      </>}
  </main></AppShell>;
}
