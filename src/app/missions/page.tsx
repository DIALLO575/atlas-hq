import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { Icon } from "@/components/icon";
import { createAtlasMission, requestAtlasMissionReview, updateAtlasMission } from "@/app/missions/actions";
import { readAtlasWorkflow, type AtlasMission } from "@/lib/atlas-workflow";

export const dynamic = "force-dynamic";
type Query = { workspaceId?: string; status?: string; q?: string; result?: string };

const statusLabels: Record<AtlasMission["status"], string> = {
  planned: "À lancer", active: "En cours", review: "En validation", done: "Terminée",
};
const statusOrder = ["all", "planned", "active", "review", "done"] as const;
const filterLabels = ["Toutes", "À lancer", "En cours", "À valider", "Terminées"];

function shortDate(value: string) {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "Date inconnue" :
    new Intl.DateTimeFormat("fr", { day: "numeric", month: "short", year: "numeric" }).format(d);
}
function path(workspaceId: string, status?: string) {
  return "/missions?workspaceId=" + encodeURIComponent(workspaceId) +
    (status && status !== "all" ? "&status=" + encodeURIComponent(status) : "");
}

export default async function MissionsPage({ searchParams }: { searchParams: Promise<Query> }) {
  const params = await searchParams;
  const data = await readAtlasWorkflow(params.workspaceId);
  const filter = statusOrder.includes(params.status as (typeof statusOrder)[number]) ? params.status ?? "all" : "all";
  const query = (params.q ?? "").trim().slice(0, 100).toLocaleLowerCase("fr");
  return <AppShell><main className="main-content atlas-workflow-page" id="main-content">
    <header className="atlas-flow-hero">
      <div>
        <p className="atlas-overline">COORDINATION / ATLAS HQ</p>
        <h1>Missions <span aria-hidden="true">✦</span></h1>
        <p>Planifiez, suivez et faites valider votre travail. Un espace, une vue claire.</p>
      </div>
      {data.status === "ready" && data.selected && <a className="atlas-flow-primary" href="#new-mission">
        <Icon name="apps"/> Nouvelle mission <Icon name="arrow-right"/></a>}
    </header>
    {data.status === "error" ? <section className="atlas-flow-error" role="alert">
      <Icon name="inbox"/><div><strong>Service Missions indisponible</strong><p>{data.message}</p>
        <Link href="/missions">Réessayer <Icon name="arrow-right"/></Link></div></section>
    : !data.selected ? <section className="atlas-flow-empty atlas-flow-empty-first">
        <span><Icon name="layers"/></span><h2>Créez votre premier workspace</h2>
        <p>Les missions sont organisées par espace et respectent les accès de ses membres.</p>
        <Link href="/workspaces">Ouvrir Workspaces <Icon name="arrow-right"/></Link>
      </section>
    : <>
      <div className="atlas-flow-workspace"><span><Icon name="layers"/> Workspace actif</span>
        <div className="atlas-flow-workspace-options">{data.spaces.map((workspace) =>
          <Link key={workspace.id} href={path(workspace.id)}
            aria-current={workspace.id === data.selected?.id ? "page" : undefined}
            className={workspace.id === data.selected?.id ? "is-current" : ""}>{workspace.name}</Link>)}</div>
        <Link href="/workspaces" className="atlas-flow-workspace-all">Gérer <Icon name="arrow-up-right"/></Link></div>
      {params.result && <div className={"atlas-flow-feedback" + (params.result === "error" ? " is-error" : "")} role="status">
        {params.result === "created" ? "Mission créée et enregistrée." :
         params.result === "updated" ? "Statut de la mission mis à jour." :
         params.result === "requested" ? "Demande envoyée dans Inbox aux administrateurs." :
         "Action impossible : vérifiez les droits ou l’état de la mission."}</div>}
      <section className="atlas-flow-kpis" aria-label="Résumé de vos missions">
        <div><span className="atlas-flow-kpi-icon"><Icon name="apps"/></span><strong>{data.missions.length}</strong><small>Missions visibles</small></div>
        <div><span className="atlas-flow-kpi-icon is-blue"><Icon name="activity"/></span><strong>{data.missions.filter((m) => m.status === "active").length}</strong><small>En cours</small></div>
        <div><span className="atlas-flow-kpi-icon is-rose"><Icon name="inbox"/></span><strong>{data.missions.filter((m) => m.status === "review").length}</strong><small>En validation</small></div>
        <div><span className="atlas-flow-kpi-icon is-green"><Icon name="layers"/></span><strong>{data.missions.filter((m) => m.status === "done").length}</strong><small>Terminées</small></div>
      </section>
      <div className="atlas-flow-columns">
        <section className="atlas-flow-main" aria-labelledby="atlas-missions-list-heading">
          <div className="atlas-flow-section-heading"><div><h2 id="atlas-missions-list-heading">Vos missions</h2>
            <p>Priorités, avancement et validation par votre équipe.</p></div>
            <Link href={"/inbox?workspaceId=" + encodeURIComponent(data.selected.id)} className="atlas-flow-heading-link">
              Inbox <Icon name="arrow-up-right"/></Link></div>
          <div className="atlas-flow-toolbar">
            <nav aria-label="Filtrer par statut" className="atlas-flow-pills">
              {statusOrder.map((status, i) => <Link key={status}
                className={filter === status ? "is-selected" : ""} aria-current={filter === status ? "page" : undefined}
                href={path(data.selected!.id, status)}>{filterLabels[i]}</Link>)}
            </nav>
            <form method="get" action="/missions" role="search" className="atlas-flow-search">
              <input type="hidden" name="workspaceId" value={data.selected.id}/>
              {filter !== "all" && <input type="hidden" name="status" value={filter}/>}
              <Icon name="search"/><label className="sr-only" htmlFor="atlas-missions-query">Rechercher une mission</label>
              <input id="atlas-missions-query" type="search" name="q" defaultValue={params.q ?? ""}
                placeholder="Rechercher..." maxLength={100}/>
              <button type="submit" aria-label="Lancer la recherche"><Icon name="arrow-right"/></button>
            </form>
          </div>
          {(() => {
            const matches = data.missions.filter((m) =>
              (filter === "all" || m.status === filter) &&
              (!query || (m.title + " " + m.description).toLocaleLowerCase("fr").includes(query)));
            return matches.length ? <div className="atlas-flow-mission-grid">
              {matches.map((mission) => <article className="atlas-flow-mission-card" key={mission.id}>
                <div className="atlas-flow-card-top">
                  <span className="atlas-flow-card-icon"><Icon name="activity"/></span>
                  <div><span className={"atlas-flow-status is-" + mission.status}>{statusLabels[mission.status]}</span>
                    {mission.priority === "high" && <span className="atlas-flow-priority">Prioritaire</span>}</div>
                </div>
                <h3>{mission.title}</h3>
                <p>{mission.description || "Aucune description ajoutée."}</p>
                <div className="atlas-flow-card-meta"><Icon name="layers"/> {data.selected!.name}
                  <span>·</span> {shortDate(mission.updatedAt)}</div>
                <div className="atlas-flow-card-footer">
                  {mission.status === "planned" && <form action={updateAtlasMission}>
                    <input name="workspaceId" value={mission.workspaceId} type="hidden"/>
                    <input name="missionId" value={mission.id} type="hidden"/>
                    <input name="status" value="active" type="hidden"/>
                    <button type="submit"><Icon name="arrow-right"/> Démarrer</button></form>}
                  {mission.status === "active" && <>
                    <form action={requestAtlasMissionReview}>
                      <input name="workspaceId" value={mission.workspaceId} type="hidden"/>
                      <input name="missionId" value={mission.id} type="hidden"/>
                      <button type="submit" className="is-primary"><Icon name="inbox"/> Demander validation</button>
                    </form>
                    <form action={updateAtlasMission}>
                      <input name="workspaceId" value={mission.workspaceId} type="hidden"/>
                      <input name="missionId" value={mission.id} type="hidden"/>
                      <input name="status" value="done" type="hidden"/>
                      <button type="submit">Terminer</button></form>
                  </>}
                  {mission.status === "review" && <Link href={"/inbox?workspaceId=" + encodeURIComponent(mission.workspaceId)}>
                    Consulter la demande <Icon name="arrow-right"/></Link>}
                  {mission.status === "done" && <span className="atlas-flow-finished"><Icon name="layers"/> Mission terminée</span>}
                </div>
              </article>)}
            </div> : <div className="atlas-flow-empty">
              <span><Icon name="activity"/></span><h3>{data.missions.length ? "Aucune mission trouvée" : "Prêt pour votre première mission ?"}</h3>
              <p>{data.missions.length
                ? "Ajustez la recherche ou changez de filtre."
                : "Créez une mission pour organiser le travail de votre équipe. Aucun exemple fictif."}</p>
              {data.missions.length ? <Link href={path(data.selected!.id)}>Voir toutes les missions <Icon name="arrow-right"/></Link>
              : <a href="#new-mission">Créer une mission <Icon name="arrow-right"/></a>}
            </div>;
          })()}
          {data.missions.length === 200 && <p className="atlas-flow-footnote">Affichage limité aux 200 dernières missions. Les compteurs reflètent cette liste.</p>}
        </section>
        <aside className="atlas-flow-aside">
          <section className="atlas-flow-create" id="new-mission" aria-labelledby="atlas-new-mission-heading">
            <div className="atlas-flow-create-heading"><span><Icon name="apps"/></span>
              <div><small>NOUVELLE MISSION</small><h2 id="atlas-new-mission-heading">Créer une mission</h2></div></div>
            <p>Donnez un nom clair à ce que vous souhaitez accomplir.</p>
            <form action={createAtlasMission}>
              <input type="hidden" name="workspaceId" value={data.selected.id}/>
              <label htmlFor="atlas-mission-title">Nom de la mission</label>
              <input id="atlas-mission-title" type="text" required name="title" minLength={1} maxLength={120}
                placeholder="Ex. Audit du nouveau dashboard"/>
              <label htmlFor="atlas-mission-description">Description <span>facultatif</span></label>
              <textarea id="atlas-mission-description" name="description" maxLength={1000} rows={3}
                placeholder="Objectif et contexte de la mission..."/>
              <label htmlFor="atlas-mission-priority">Priorité</label>
              <select id="atlas-mission-priority" name="priority" defaultValue="normal">
                <option value="normal">Normale</option><option value="high">Haute</option>
              </select>
              <button type="submit"><Icon name="apps"/> Créer la mission <Icon name="arrow-right"/></button>
            </form>
          </section>
          <div className="atlas-flow-helper"><Icon name="inbox"/>
            <p><strong>Comment ça marche ?</strong> Créez, démarrez et demandez une validation. Les administrateurs peuvent répondre depuis Inbox.</p></div>
        </aside>
      </div>
    </>}
  </main></AppShell>;
}
