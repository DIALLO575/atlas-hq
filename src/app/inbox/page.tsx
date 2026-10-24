import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { Icon } from "@/components/icon";
import { decideAtlasMissionReview } from "@/app/missions/actions";
import { readAtlasWorkflow, type AtlasReview } from "@/lib/atlas-workflow";

export const dynamic = "force-dynamic";
type Query = { workspaceId?: string; filter?: string; result?: string };
const filters = ["pending", "sent", "history"] as const;
const labels = ["À traiter", "Envoyées", "Historique"] as const;

function dateText(value: string) {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "Date indisponible" :
    new Intl.DateTimeFormat("fr", { day: "numeric", month: "short", year: "numeric" }).format(d);
}
function inboxPath(workspaceId: string, filter?: string) {
  return "/inbox?workspaceId=" + encodeURIComponent(workspaceId) + (filter ? "&filter=" + encodeURIComponent(filter) : "");
}
function ApprovalCard({ review, workspaceId, canDecide, own }: {
  review: AtlasReview; workspaceId: string; canDecide: boolean; own: boolean;
}) {
  const status = review.decision === "pending" ? "En attente" :
    review.decision === "approved" ? "Approuvée" : "Refusée";
  return <article className="atlas-flow-review-card">
    <div className="atlas-flow-review-icon"><Icon name="inbox"/></div>
    <div className="atlas-flow-review-main">
      <div className="atlas-flow-review-top">
        <span className="atlas-flow-review-kind">VALIDATION DE MISSION</span>
        <span className={"atlas-flow-review-badge is-" + review.decision}>{status}</span>
      </div>
      <h3>{review.title}</h3>
      {review.description && <p>{review.description}</p>}
      <div className="atlas-flow-review-meta">
        <span>{own ? "Demande envoyée par vous" : "Demande d’un membre"}</span>
        <span>·</span><span>{dateText(review.createdAt)}</span>
        {review.decidedAt && <><span>·</span><span>Décision du {dateText(review.decidedAt)}</span></>}
      </div>
      {review.decision === "pending" && canDecide ? <div className="atlas-flow-review-actions">
        <form action={decideAtlasMissionReview}>
          <input type="hidden" name="workspaceId" value={workspaceId}/>
          <input type="hidden" name="reviewId" value={review.id}/>
          <input type="hidden" name="decision" value="approved"/>
          <button type="submit" className="is-approve"><Icon name="layers"/> Approuver</button>
        </form>
        <form action={decideAtlasMissionReview}>
          <input type="hidden" name="workspaceId" value={workspaceId}/>
          <input type="hidden" name="reviewId" value={review.id}/>
          <input type="hidden" name="decision" value="rejected"/>
          <button type="submit" className="is-reject"><Icon name="close"/> Refuser</button>
        </form>
      </div> : review.decision === "pending" ? <p className="atlas-flow-waiting">
        <Icon name="activity"/> En attente d’un administrateur du workspace.</p> : null}
    </div>
  </article>;
}

export default async function InboxPage({ searchParams }: { searchParams: Promise<Query> }) {
  const params = await searchParams;
  const data = await readAtlasWorkflow(params.workspaceId);
  const filter = filters.includes(params.filter as (typeof filters)[number]) ? params.filter ?? "pending" : "pending";
  return <AppShell><main className="main-content atlas-workflow-page atlas-inbox-page" id="main-content">
    <header className="atlas-flow-hero">
      <div><p className="atlas-overline">CENTRE DE DÉCISIONS / ATLAS HQ</p>
        <h1>Inbox <span aria-hidden="true">✦</span></h1>
        <p>Les validations qui ont besoin de vous. Rien de plus.</p></div>
      {data.status === "ready" && data.selected && <Link href={"/missions?workspaceId=" + encodeURIComponent(data.selected.id)}
        className="atlas-flow-primary"><Icon name="activity"/> Voir les missions <Icon name="arrow-right"/></Link>}
    </header>
    {data.status === "error" ? <section className="atlas-flow-error" role="alert">
      <Icon name="inbox"/><div><strong>Inbox indisponible</strong><p>{data.message}</p>
        <Link href="/inbox">Réessayer <Icon name="arrow-right"/></Link></div></section>
    : !data.selected ? <section className="atlas-flow-empty atlas-flow-empty-first">
      <span><Icon name="layers"/></span><h2>Aucun espace disponible</h2><p>Créez un workspace pour échanger des demandes de validation.</p>
      <Link href="/workspaces">Créer un workspace <Icon name="arrow-right"/></Link></section>
    : <>
      <div className="atlas-flow-workspace"><span><Icon name="layers"/> Workspace actif</span>
        <div className="atlas-flow-workspace-options">{data.spaces.map((space) =>
          <Link key={space.id} className={space.id === data.selected?.id ? "is-current" : ""}
            aria-current={space.id === data.selected?.id ? "page" : undefined}
            href={inboxPath(space.id)}>{space.name}</Link>)}</div>
        <Link className="atlas-flow-workspace-all" href="/workspaces">Gérer <Icon name="arrow-up-right"/></Link></div>
      {params.result && <div role="status" className={"atlas-flow-feedback" + (params.result === "error" ? " is-error" : "")}>
        {params.result === "decided" ? "Votre décision a été enregistrée." : "Impossible de traiter la demande. Elle a peut-être déjà été résolue."}</div>}
      {(() => {
        const admin = data.selected.role !== "member";
        const pending = data.reviews.filter((review) => review.decision === "pending");
        const own = data.reviews.filter((review) => review.requestedBy === data.userId);
        const decided = data.reviews.filter((review) => review.decision !== "pending");
        const incoming = admin ? pending : [];
        const visible = filter === "sent" ? own : filter === "history" ? decided : incoming;
        return <>
          <section className="atlas-flow-kpis" aria-label="Résumé des validations">
            <div><span className="atlas-flow-kpi-icon is-rose"><Icon name="inbox"/></span>
              <strong>{incoming.length}</strong><small>À traiter</small></div>
            <div><span className="atlas-flow-kpi-icon"><Icon name="arrow-up-right"/></span>
              <strong>{own.length}</strong><small>Demandes envoyées</small></div>
            <div><span className="atlas-flow-kpi-icon is-green"><Icon name="layers"/></span>
              <strong>{decided.length}</strong><small>Décisions visibles</small></div>
          </section>
          <div className="atlas-flow-columns atlas-flow-inbox-columns">
            <section className="atlas-flow-main">
              <div className="atlas-flow-section-heading"><div><h2>Centre de validation</h2>
                <p>Demandes issues de vraies missions, selon vos droits.</p></div>
                <span className="atlas-flow-count">{visible.length} élément{visible.length > 1 ? "s" : ""}</span>
              </div>
              <nav className="atlas-flow-pills atlas-flow-inbox-tabs" aria-label="Vue Inbox">
                {filters.map((value, index) => <Link key={value} href={inboxPath(data.selected!.id, value)}
                  className={filter === value ? "is-selected" : ""}
                  aria-current={filter === value ? "page" : undefined}>{labels[index]}</Link>)}
              </nav>
              {visible.length ? <div className="atlas-flow-reviews">
                {visible.map((review) => <ApprovalCard key={review.id} review={review}
                  workspaceId={data.selected!.id} canDecide={admin} own={review.requestedBy === data.userId}/>)}
              </div> : <div className="atlas-flow-empty">
                <span><Icon name="inbox"/></span>
                <h3>{filter === "pending" ? "Tout est à jour" : filter === "sent" ? "Aucune demande envoyée" : "Pas encore de décision"}</h3>
                <p>{filter === "pending" ? admin
                  ? "Aucune validation ne nécessite votre décision pour le moment."
                  : "Les validations sont réservées aux administrateurs. Vous pouvez consulter vos demandes envoyées."
                  : filter === "sent" ? "Envoyez une mission en validation pour la retrouver ici."
                  : "Les décisions réelles sur les missions apparaîtront ici."}</p>
                <Link href={"/missions?workspaceId=" + encodeURIComponent(data.selected.id)}>Voir les missions <Icon name="arrow-right"/></Link>
              </div>}
            </section>
            <aside className="atlas-flow-aside">
              <section className="atlas-flow-guide">
                <span className="atlas-flow-guide-icon"><Icon name="inbox"/></span>
                <h2>Une Inbox utile, sans bruit</h2>
                <p>Les demandes arrivent ici quand une mission est envoyée en validation. Seuls les administrateurs peuvent décider.</p>
                <div><span>1</span><p><strong>Mission créée</strong> dans le workspace.</p></div>
                <div><span>2</span><p><strong>Validation demandée</strong> depuis Missions.</p></div>
                <div><span>3</span><p><strong>Décision enregistrée</strong> et mission mise à jour.</p></div>
                <Link href={"/missions?workspaceId=" + encodeURIComponent(data.selected.id)}>
                  Ouvrir Missions <Icon name="arrow-right"/></Link>
              </section>
              <p className="atlas-flow-footnote">Les notifications d’agents et les événements d’applications seront ajoutés lorsqu’un service réel les alimentera.</p>
            </aside>
          </div>
          {data.reviews.length === 200 && <p className="atlas-flow-footnote">Les validations affichées sont limitées aux 200 plus récentes.</p>}
        </>;
      })()}
    </>}
  </main></AppShell>;
}
