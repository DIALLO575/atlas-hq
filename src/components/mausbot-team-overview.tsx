"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { Icon } from "@/components/icon";
import type { TeamView, TeamViewPerson } from "../../packages/engines/mausbot/src/team-view.mjs";

const STATUS_LABEL: Record<TeamViewPerson["status"], string> = { active: "Actif", waiting: "En attente", idle: "Au repos" };

function Portrait({ person, workspaceId }: { person: TeamViewPerson; workspaceId: string }) {
  const [failed, setFailed] = useState(false);
  const src = person.hasAvatar ? "/api/engines/mausbot/avatar?workspaceId=" + encodeURIComponent(workspaceId) +
    "&botId=" + encodeURIComponent(person.id) : null;
  return <span className="atlas-chief-portrait atlas-agent-portrait">
    {src && !failed ? <Image src={src} alt="" width={48} height={48} unoptimized onError={() => setFailed(true)} /> : <Icon name="bot" />}
  </span>;
}

/** Owner-only live "Chiefs & teams" board (read-only). Hidden for non-owners. */
export function MausbotTeamOverview({ workspaceId, revision = 0 }: { workspaceId: string; revision?: number }) {
  const [view, setView] = useState<TeamView | null>(null);
  const [issue, setIssue] = useState("");
  useEffect(() => {
    if (!workspaceId) return;
    const abort = new AbortController();
    void fetch("/api/engines/mausbot/teams?workspaceId=" + encodeURIComponent(workspaceId),
      { credentials: "same-origin", cache: "no-store", signal: abort.signal })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw Error(typeof data.error === "string" ? data.error : "MAUSBOT_UNAVAILABLE");
        if (data.source !== "live-read-only" || !Array.isArray(data.teams)) throw Error("TEAM_VIEW_INVALID");
        if (!abort.signal.aborted) { setView(data as TeamView); setIssue(""); }
      })
      .catch((error: unknown) => {
        if (!abort.signal.aborted) { setView(null); setIssue(error instanceof Error ? error.message : "MAUSBOT_UNAVAILABLE"); }
      });
    return () => abort.abort();
  }, [workspaceId, revision]);

  if (issue === "MAUSBOT_OWNER_REQUIRED" || issue === "WORKSPACE_FORBIDDEN") return null;
  if (issue) return <p className="atlas-people-alert" role="status">Vue Chiefs indisponible ({issue}).</p>;
  if (!view) return null;
  return <section className="atlas-chief-board" aria-label="Chiefs of Staff et équipes">
    <div className="atlas-team-directory-heading">
      <div><p className="atlas-people-overline">CHIEFS OF STAFF</p><h2>Qui pilote quoi</h2></div>
      <span>{view.activeTotal} actif{view.activeTotal > 1 ? "s" : ""} · lecture seule</span>
    </div>
    {view.degraded.length > 0 && <p className="atlas-chief-degraded">Sources partielles : {view.degraded.join(", ")}</p>}
    {view.teams.length === 0 && <p className="atlas-team-no-results">Aucun Chief of Staff marqué dans MAUSBOT.</p>}
    <div className="atlas-chief-grid">
      {view.teams.map(({ chief, members, sectionLabel, activeCount }) => <article key={chief.id} className="atlas-chief-card">
        <header className="atlas-chief-head">
          <Portrait person={chief} workspaceId={workspaceId} />
          <div className="atlas-chief-id">
            <strong>{chief.name}</strong>
            <span>{chief.title ?? "Chief of Staff"}{sectionLabel ? " · " + sectionLabel : ""}</span>
          </div>
          <span className={"atlas-chief-status is-" + chief.status}>{STATUS_LABEL[chief.status]}</span>
        </header>
        <p className="atlas-chief-last">{chief.lastMessage?.text ?? "Dernier message indisponible."}</p>
        <footer className="atlas-chief-meta">
          <span>{members.length} membre{members.length > 1 ? "s" : ""} · {activeCount} actif{activeCount > 1 ? "s" : ""}</span>
          <span>{chief.openReports === null ? "Rapports : —" : chief.openReports + " rapport" + (chief.openReports > 1 ? "s" : "") + " ouvert" + (chief.openReports > 1 ? "s" : "")}</span>
        </footer>
        {members.length > 0 && <ul className="atlas-chief-members">
          {members.slice(0, 12).map((m) => <li key={m.id}><Portrait person={m} workspaceId={workspaceId} />
            <span>{m.name}</span><i className={"atlas-chief-dot is-" + m.status} aria-label={STATUS_LABEL[m.status]} /></li>)}
        </ul>}
      </article>)}
    </div>
  </section>;
}
