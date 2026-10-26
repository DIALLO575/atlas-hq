"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/icon";
import { MausbotTeamOverview } from "@/components/mausbot-team-overview";
import { listWorkspaces } from "@/app/workspaces/actions";
import type { WorkspaceResult } from "@/lib/workspaces/contract";
import { mergeMausbotMessages, lastMausbotMessageId, rememberMausbotThread, MAUSBOT_THREAD_CACHE_TTL_MS } from "../../packages/engines/mausbot/src/message-updates.mjs";

type Task = { threadId: string; title: string | null; activity: string | null; active: boolean };
type Agent = { id: string; name: string; title?: string | null; section?: string | null; chiefOfStaff?: boolean; hasAvatar?: boolean; activeTaskId: string | null; tasks: Task[] };
type Team = { id: string; name: string; section?: string | null; memberIds: string[]; defaultResponder?: { kind: string; botId?: string }; activeTaskId?: string | null; tasks?: Task[] };
type Inventory = { agents: Agent[]; groups: Team[]; canWrite: boolean };
type Message = { id: string | null; at: string | null; role: string | null; kind: string | null; text: string; hasImage?: boolean; queued?: boolean; steered?: boolean;
  tool?: { name?: string; ok?: boolean; spoken?: string; setup?: string; terminal?: string };
  card?: { title?: string; subtitle?: string; answered?: boolean; dismissed?: boolean; expired?: boolean } };
type Selection = { kind: "team" | "agent"; id: string } | null;

/** A Chief of Staff is shown only when MAUSBOT has explicitly marked a bot.
 * A channel's default responder is never presented as its Chief. */
function chiefFor(team: Team, agents: Agent[]) {
  const direct = agents.find(agent => agent.chiefOfStaff === true && team.memberIds.includes(agent.id));
  if (direct) return { agent: direct, label: "Chief of Staff" };
  const section = team.section
    ? agents.find(agent => agent.chiefOfStaff === true && agent.section === team.section)
    : null;
  return section ? { agent: section, label: "Chief de section" } : null;
}

/** Same-origin, permission-checked avatar. Broken or absent image = original MAUSBOT icon. */
function AgentPortrait({ agent, workspaceId, className = "", fallback = "bot" }: {
  agent: Agent | null | undefined; workspaceId: string; className?: string; fallback?: "bot" | "layers";
}) {
  const [failedSource, setFailedSource] = useState<string | null>(null);
  const source = agent?.hasAvatar && workspaceId
    ? "/api/engines/mausbot/avatar?workspaceId=" + encodeURIComponent(workspaceId) +
      "&botId=" + encodeURIComponent(agent.id) : null;
  return <span className={className + " atlas-agent-portrait"}>
    {source && failedSource !== source ? <Image key={source} src={source} alt="" width={64} height={64}
      unoptimized onError={() => setFailedSource(source)} />
      : <Icon name={fallback} />}
  </span>;
}

function readableTime(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value.slice(0, 40) : date.toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });
}

function hasActiveThread(agent: Agent) {
  return Boolean(agent.activeTaskId || agent.tasks.some(task => task.active));
}

function threadsFor(entity: Agent | Team | null): Task[] {
  if (!entity) return [];
  const tasks = entity.tasks ?? [];
  const byId = new Map(tasks.map(task => [task.threadId, task]));
  if (entity.activeTaskId && !byId.has(entity.activeTaskId)) {
    byId.set(entity.activeTaskId, { threadId: entity.activeTaskId, title: "Fil actif", activity: null, active: true });
  }
  return [...byId.values()];
}

function cachedThreadMessages(
  cache: Map<string,{messages:Message[];updatedAt:number}>,key:string,now = Date.now(),
): Message[] {
  const entry = cache.get(key);
  if (entry && now - entry.updatedAt >= MAUSBOT_THREAD_CACHE_TTL_MS) {
    cache.delete(key);
    return [];
  }
  return entry?.messages ?? [];
}

export function AgentsWorkspace() {
  const [spaces, setSpaces] = useState<WorkspaceResult | { status: "loading" }>({ status: "loading" });
  const [workspaceId, setWorkspaceId] = useState("");
  const [inventory, setInventory] = useState<Inventory | null>(null);
  const [inventoryBusy, setInventoryBusy] = useState(false);
  const [inventoryIssue, setInventoryIssue] = useState("");
  const [inventoryRevision, setInventoryRevision] = useState(0);
  const [query, setQuery] = useState("");
  const [selection, setSelection] = useState<Selection>(null);
  const [threadId, setThreadId] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [messagesIssue, setMessagesIssue] = useState("");
  const [messagesBusy, setMessagesBusy] = useState(false);
  const [messagesRevision, setMessagesRevision] = useState(0);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sendIssue, setSendIssue] = useState("");
  const [openTeamId, setOpenTeamId] = useState<string | null>(null);
  const [openAgentId, setOpenAgentId] = useState<string | null>(null);
  const [showAllAgents, setShowAllAgents] = useState(false);
  const [fullscreenChat, setFullscreenChat] = useState(false);
  const threadCache = useRef(new Map<string,{messages: Message[]; updatedAt:number}>());
  const activeMessageKey = useRef("");
  const scrollRef = useRef<HTMLOListElement>(null);

  useEffect(() => { threadCache.current.clear(); }, [workspaceId]);

  useEffect(() => {
    if (!fullscreenChat) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const esc = (event: KeyboardEvent) => {
      if (event.key === "Escape") setFullscreenChat(false);
    };
    window.addEventListener("keydown",esc);
    return () => { document.body.style.overflow = previous; window.removeEventListener("keydown",esc); };
  }, [fullscreenChat]);

  useEffect(() => {
    let mounted = true;
    void listWorkspaces().then(result => {
      if (!mounted) return;
      setSpaces(result);
      if (result.status === "ready") setWorkspaceId(result.selectedId);
    }).catch(() => { if (mounted) setSpaces({ status: "error", message: "WORKSPACES_UNAVAILABLE" }); });
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (!workspaceId) return;
    const abort = new AbortController();
    void Promise.resolve().then(async () => {
      if (abort.signal.aborted) return;
      setInventoryBusy(true);
      setInventory(null);
      setInventoryIssue("");
      try {
        const response = await fetch("/api/engines/mausbot?workspaceId=" +
          encodeURIComponent(workspaceId) + "&view=inventory",
          { credentials: "same-origin", cache: "no-store", signal: abort.signal });
        const data = await response.json();
        if (!response.ok) throw Error(typeof data.error === "string" ? data.error : "MAUSBOT_UNAVAILABLE");
        if (data.source !== "live-read-only" || !Array.isArray(data.agents) || !Array.isArray(data.groups)) {
          throw Error("MAUSBOT_INVENTORY_INVALID");
        }
        if (!abort.signal.aborted) setInventory({
          agents: data.agents,
          groups: data.groups,
          canWrite: data.canWrite === true,
        });
      } catch (error) {
        if (!abort.signal.aborted) setInventoryIssue(error instanceof Error ? error.message : "MAUSBOT_UNAVAILABLE");
      } finally { if (!abort.signal.aborted) setInventoryBusy(false); }
    });
    return () => abort.abort();
  }, [workspaceId, inventoryRevision]);

  const openedTeam = inventory?.groups.find(team => team.id === openTeamId) ?? null;
  const openedAgent = inventory?.agents.find(agent => agent.id === openAgentId) ?? null;
  const detailOpen = Boolean(openedTeam || openedAgent);
  const selectedTeam = selection?.kind === "team" ? openedTeam : null;
  const selectedAgent = selection?.kind === "agent"
    ? inventory?.agents.find(agent => agent.id === selection.id) ?? null : null;
  const selected = selectedAgent ?? selectedTeam;
  const currentThreads = useMemo(() => threadsFor(selected), [selected]);
  const selectedName = selected?.name ?? "";
  const memberAgents = openedTeam?.memberIds
    .map(id => inventory?.agents.find(agent => agent.id === id))
    .filter((agent): agent is Agent => Boolean(agent)) ?? [];
  const chief = openedTeam && inventory ? chiefFor(openedTeam, inventory.agents) : null;
  const normalQuery = query.trim().toLocaleLowerCase("fr");
  const visibleTeams = inventory?.groups.filter(team =>
    (team.name + " " + (chiefFor(team, inventory.agents)?.agent.name ?? "") + " " +
      team.memberIds.map(id => inventory.agents.find(agent => agent.id === id)?.name ?? "").join(" "))
      .toLocaleLowerCase("fr").includes(normalQuery)) ?? [];
  const visibleAgents = inventory?.agents.filter(agent =>
    (agent.name + " " + (agent.title ?? "") + " " + (agent.section ?? "") + " " +
      inventory.groups.filter(team => team.memberIds.includes(agent.id)).map(team => team.name).join(" "))
      .toLocaleLowerCase("fr").includes(normalQuery)) ?? [];
  const activeAgentsCount = inventory?.agents.filter(hasActiveThread).length ?? 0;
  const activeWorkspace = spaces.status === "ready" ? spaces.workspaces.find(space => space.id === workspaceId) : null;
  const canReadMessages = activeWorkspace?.role === "owner" || activeWorkspace?.role === "admin";
  const canSend = inventory?.canWrite === true && activeWorkspace?.role === "owner" && !!selected && !!threadId;
  const selectedKind = selection?.kind ?? null;
  const selectedId = selection?.id ?? null;
  const messageKey = workspaceId && selectedKind && selectedId && threadId
    ? [workspaceId,selectedKind,selectedId,threadId].join("|") : "";
  useEffect(() => { activeMessageKey.current = messageKey; }, [messageKey]);

  async function sendMessage() {
    if (!canSend || sending || !draft.trim() || !selection || !threadId) return;
    const value = draft.trim();
    setSending(true); setSendIssue("");
    try {
      const response = await fetch("/api/engines/mausbot/primitives", {
        method: "POST", credentials: "same-origin", cache: "no-store",
        headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({ workspaceId,
          primitive: selection.kind === "team" ? "channels.messages.send" : "conversations.messages.send",
          args: selection.kind === "team"
            ? { channel_id: selection.id, task_id: threadId, text: value, send_id: crypto.randomUUID().replaceAll("-", "") }
            : { bot_id: selection.id, task_id: threadId, text: value, send_id: crypto.randomUUID().replaceAll("-", "") },
        }),
      });
      const result = await response.json();
      if (!response.ok) throw Error(typeof result.error === "string" ? result.error : "MAUSBOT_SEND_UNAVAILABLE");
      setDraft(""); setMessagesRevision(value => value + 1);
    } catch (error) {
      setSendIssue(error instanceof Error ? error.message : "MAUSBOT_SEND_UNAVAILABLE");
    } finally { setSending(false); }
  }

  function selectItem(next: Selection, tasks: Task[]) {
    setDraft(""); setSendIssue("");
    setSelection(next);
    setThreadId(tasks.find(task => task.active)?.threadId ?? tasks[0]?.threadId ?? "");
    const chosenTaskId = tasks.find(task => task.active)?.threadId ?? tasks[0]?.threadId ?? "";
    const key = next && chosenTaskId ? [workspaceId,next.kind,next.id,chosenTaskId].join("|") : "";
    setMessages(cachedThreadMessages(threadCache.current,key));
    setMessagesIssue("");
    setMessagesBusy(false);
    if (window.matchMedia("(max-width:700px)").matches) {
      window.requestAnimationFrame(() => document.getElementById("atlas-people-conversation")?.scrollIntoView({ behavior: "smooth", block: "start" }));
    }
  }

  useEffect(() => {
    if (!workspaceId || !selectedKind || !selectedId || !threadId || !canReadMessages || !messageKey) return;
    const abort = new AbortController();
    let reading = false;
    const key = messageKey;
    const load = async () => {
      if (reading || abort.signal.aborted || document.visibilityState === "hidden" ||
          navigator.onLine === false) return;
      reading = true;
      if (!threadCache.current.has(key)) setMessagesBusy(true);
      try {
        const cached = cachedThreadMessages(threadCache.current,key);
        const cursor = lastMausbotMessageId(cached);
        const params = new URLSearchParams({workspaceId,kind:selectedKind,
          targetId:selectedId,taskId:threadId});
        if (cursor) params.set("afterId",cursor);
        const response = await fetch("/api/engines/mausbot/updates?" + params.toString(), {
          credentials:"same-origin",cache:"no-store",signal:abort.signal,
        });
        const data = await response.json() as {messages?:Message[];reset?:boolean;error?:string};
        if (!response.ok) throw Error(data.error ?? "CONVERSATION_UNAVAILABLE");
        if (!Array.isArray(data.messages) || typeof data.reset !== "boolean") {
          throw Error("CONVERSATION_INVALID");
        }
        if (abort.signal.aborted || activeMessageKey.current !== key) return;
        const current = threadCache.current.get(key)?.messages ?? [];
        const next = mergeMausbotMessages(current,data.messages,data.reset);
        rememberMausbotThread(threadCache.current,key,next);
        if (next !== current) setMessages(next);
        setMessagesIssue("");
      } catch (error) {
        // Keep already loaded messages visible during transient outages.
        if (!abort.signal.aborted && activeMessageKey.current === key) {
          setMessagesIssue(error instanceof Error ? error.message : "CONVERSATION_UNAVAILABLE");
        }
      } finally {
        reading = false;
        if (!abort.signal.aborted && activeMessageKey.current === key) setMessagesBusy(false);
      }
    };
    void load();
    const pollMs = window.matchMedia("(max-width:700px)").matches ? 12000 : 8000;
    const interval = window.setInterval(() => void load(),pollMs);
    const onVisible = () => { if (document.visibilityState === "visible") void load(); };
    document.addEventListener("visibilitychange",onVisible);
    window.addEventListener("online",onVisible);
    return () => {
      abort.abort(); window.clearInterval(interval);
      document.removeEventListener("visibilitychange",onVisible);
      window.removeEventListener("online",onVisible);
    };
  }, [workspaceId,selectedKind,selectedId,threadId,canReadMessages,messagesRevision,messageKey]);

  useEffect(() => {
    if (!scrollRef.current || messagesBusy) return;
    const list = scrollRef.current;
    if (list.scrollHeight - list.scrollTop - list.clientHeight < 180) list.scrollTop = list.scrollHeight;
  }, [messages, messagesBusy]);

  const disconnectedCopy = inventoryIssue === "MAUSBOT_PRECONNECTION_GATE_CLOSED" || inventoryIssue === "MAUSBOT_NOT_CONFIGURED"
    ? "MAUSBOT n’est pas connecté à ce workspace. Identifiez l’instance et validez le gate de préconnexion pour obtenir des équipes et conversations réelles."
    : inventoryIssue ? "Inventaire indisponible : " + inventoryIssue : "L’inventaire sera affiché uniquement après lecture autorisée du moteur.";

  return (
    <div className="atlas-people-space atlas-people-team-space">
      <header className="atlas-people-hero atlas-people-hero-compact">
        <div className="atlas-people-hero-copy">
          <p className="atlas-people-overline"><Icon name="layers" /> ATLAS / AGENTS</p>
          <h1>Vos teams. <span>Vos agents.</span></h1>
          <p>Les bonnes personnes. Les bons échanges. Au même endroit.</p>
        </div>
        <div className="atlas-people-hero-visual" aria-hidden="true">
          <span className="atlas-people-visual-back"><Icon name="layers" /></span>
          <span className="atlas-people-visual-front"><Icon name="bot" /></span>
          <span className="atlas-people-visual-orbit" />
        </div>
      </header>

      <section className="atlas-people-toolbar" aria-label="Workspace et rafraîchissement">
        <div className="atlas-people-toolbar-title">
          <span className="atlas-people-toolbar-icon"><Icon name="layers" /></span>
          <div><strong>Équipes MAUSBOT</strong><small>{inventory ? inventory.groups.length + " équipe(s) réelles" : "Inventaire sécurisé"}</small></div>
        </div>
        <div className="atlas-people-toolbar-actions">
          {spaces.status === "ready" && <label>Workspace
            <select value={workspaceId} onChange={event => {
              setQuery(""); setShowAllAgents(false); setFullscreenChat(false); setOpenTeamId(null);
              setOpenAgentId(null); setSelection(null); setThreadId(""); setMessages([]);
              setMessagesIssue(""); setDraft(""); setSendIssue(""); setWorkspaceId(event.target.value);
            }}>
              {spaces.workspaces.map(space => <option key={space.id} value={space.id}>{space.name}</option>)}
            </select>
          </label>}
          <span className={"atlas-people-connectivity" + (inventory ? " is-connected" : "")}>
            <span aria-hidden="true" />{inventory ? "Inventaire réel" : inventoryBusy ? "Vérification…" : "Non connecté"}
          </span>
          <button type="button" className="atlas-people-icon-button" disabled={!workspaceId || inventoryBusy}
            onClick={() => setInventoryRevision(value => value + 1)} aria-label="Actualiser les équipes" title="Actualiser les équipes">
            <Icon name="rotate-ccw" />
          </button>
        </div>
      </section>

      {spaces.status === "error" && <p className="atlas-people-alert" role="alert">Workspaces indisponibles.</p>}
      {spaces.status === "loading" && <p role="status">Chargement des workspaces…</p>}
      {!inventory && <section className="atlas-team-empty" role="status">
        <Icon name="shield-check" />
        <div><strong>{inventoryBusy ? "Chargement des équipes…" : "Équipes non disponibles"}</strong>
          <p>{inventoryBusy ? "Lecture du moteur MAUSBOT…" : disconnectedCopy}</p>
        </div>
      </section>}

      {inventory && !detailOpen && <div className="atlas-agents-directory">
      <div className="atlas-people-kpi-grid" aria-label="Vue d’ensemble MAUSBOT">
        <div className="atlas-people-kpi"><span className="atlas-people-kpi-icon is-teams"><Icon name="layers" /></span><strong>{inventory.groups.length}</strong><small>Teams</small></div>
        <div className="atlas-people-kpi"><span className="atlas-people-kpi-icon is-agents"><Icon name="bot" /></span><strong>{inventory.agents.length}</strong><small>Agents</small></div>
        <div className="atlas-people-kpi"><span className="atlas-people-kpi-icon is-active"><Icon name="inbox" /></span><strong>{activeAgentsCount}</strong><small>Avec fil actif</small></div>
      </div>
      <label className="atlas-people-search atlas-people-global-search">
        <Icon name="search" /><span className="sr-only">Chercher une team ou un agent</span>
        <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Chercher une team ou un agent…" />
      </label>
      <section className="atlas-team-directory" aria-label="Équipes MAUSBOT">
        <div className="atlas-team-directory-heading">
          <div><p className="atlas-people-overline">TEAMS</p><h2>Explorer les équipes</h2></div>
          <span>{inventory.groups.length} équipe{inventory.groups.length > 1 ? "s" : ""}</span>
        </div>
        <MausbotTeamOverview workspaceId={workspaceId} revision={inventoryRevision} />
        <div className="atlas-team-grid">
          {visibleTeams.map(team => {
            const teamChief = chiefFor(team, inventory.agents);
            const members = team.memberIds.map(id => inventory.agents.find(agent => agent.id === id)).filter((agent): agent is Agent => Boolean(agent));
            const engaged = members.filter(hasActiveThread).length;
            return <button type="button" key={team.id} className="atlas-team-card atlas-team-card-v2"
              onClick={() => {
                setOpenAgentId(null); setOpenTeamId(team.id);
                selectItem({ kind: "team", id: team.id }, threadsFor(team));
              }}
              aria-label={"Ouvrir l’équipe " + team.name}>
              <span className="atlas-team-card-top">
                <AgentPortrait agent={teamChief?.agent} workspaceId={workspaceId} className="atlas-team-card-icon" fallback="layers" />
                <span className="atlas-team-card-eyebrow">TEAM</span>
                <span className="atlas-card-arrow"><Icon name="arrow-up-right" /></span>
              </span>
              <strong className="atlas-team-card-name">{team.name}</strong>
              <span className="atlas-team-card-chief"><Icon name="shield-check" />{teamChief?.agent.name ?? "Chief non renseigné"}</span>
              <span className="atlas-team-card-portraits">
                <span className="atlas-team-avatar-stack">
                  {members.slice(0, 4).map(agent => <AgentPortrait key={agent.id} agent={agent}
                    workspaceId={workspaceId} className="atlas-team-stack-avatar" />)}
                  {!members.length && <span className="atlas-team-stack-empty"><Icon name="bot" /></span>}
                </span>
                <span>{team.memberIds.length} membre{team.memberIds.length > 1 ? "s" : ""}</span>
              </span>
              <span className="atlas-team-card-footer">
                <span className="atlas-status-indicator"><span className="atlas-status-dot" />{engaged} avec fil actif</span>
                <strong>Ouvrir <Icon name="arrow-right" /></strong>
              </span>
            </button>;
          })}
        </div>
        {!inventory.groups.length && <div className="atlas-team-empty"><Icon name="layers" /><div><strong>Aucune équipe MAUSBOT retournée</strong><p>Cette instance ne présente aucun canal accessible. Aucune équipe fictive n’est ajoutée.</p></div></div>}
        {inventory.groups.length > 0 && visibleTeams.length === 0 && <p className="atlas-team-no-results">Aucune équipe ne correspond à cette recherche.</p>}
      </section>
      <section className="atlas-agent-directory" aria-label="Répertoire des agents MAUSBOT">
        <div className="atlas-team-directory-heading">
          <div><p className="atlas-people-overline">AGENTS</p><h2>Vos agents</h2></div>
          <span>{visibleAgents.length} résultat{visibleAgents.length > 1 ? "s" : ""}</span>
        </div>
        <div className="atlas-agent-grid">
          {visibleAgents.slice(0, showAllAgents ? visibleAgents.length : 12).map(agent => {
            const memberships = inventory.groups.filter(team => team.memberIds.includes(agent.id));
            return <button type="button" key={agent.id} className="atlas-agent-card-v2"
              aria-label={"Ouvrir l’agent " + agent.name}
              onClick={() => {
                setOpenTeamId(null); setOpenAgentId(agent.id);
                selectItem({ kind: "agent", id: agent.id }, threadsFor(agent));
              }}>
              <span className="atlas-agent-card-head">
                <AgentPortrait agent={agent} workspaceId={workspaceId} className="atlas-agent-card-avatar" />
                <span className="atlas-card-arrow"><Icon name="arrow-up-right" /></span>
              </span>
              <strong>{agent.name}</strong>
              <span className="atlas-agent-card-role">{agent.title || "Agent MAUSBOT"}</span>
              <span className="atlas-agent-card-tag">{memberships[0]?.name || "Indépendant"}</span>
              <span className="atlas-agent-card-bottom">
                <span className="atlas-status-indicator"><span className={"atlas-status-dot" + (hasActiveThread(agent) ? " is-active" : "")} />
                  {hasActiveThread(agent) ? "Fil actif" : "Aucun fil actif"}</span>
                <span className="atlas-agent-card-chat">Chat <Icon name="inbox" /></span>
              </span>
            </button>;
          })}
        </div>
        {visibleAgents.length === 0 && <p className="atlas-team-no-results">Aucun agent ne correspond à cette recherche.</p>}
        {visibleAgents.length > 12 && <button type="button" className="atlas-show-agents"
          onClick={() => setShowAllAgents(value => !value)}>
          {showAllAgents ? "Voir moins" : "Afficher les " + visibleAgents.length + " agents"}
          <Icon name={showAllAgents ? "arrow-up" : "arrow-down"} />
        </button>}
      </section>
    </div>}

      {inventory && detailOpen && <section className="atlas-team-detail" id="atlas-people-detail"
        aria-label={openedTeam ? "Équipe " + openedTeam.name : "Agent " + openedAgent?.name}>
        <header className="atlas-team-detail-header">
          <button type="button" className="atlas-team-back" onClick={() => {
            setFullscreenChat(false); setOpenTeamId(null); setOpenAgentId(null);
            setSelection(null); setThreadId(""); setMessages([]); setDraft(""); setSendIssue("");
          }}><Icon name="arrow-left" /> Teams & Agents</button>
          <div className="atlas-team-detail-title">
            {openedAgent
              ? <AgentPortrait agent={openedAgent} workspaceId={workspaceId} className="atlas-team-detail-mark" />
              : <span className="atlas-team-detail-mark"><Icon name="layers" /></span>}
            <div>
              <p className="atlas-people-overline">{openedTeam ? "TEAM MAUSBOT" : "AGENT MAUSBOT"}</p>
              <h2>{openedTeam?.name ?? openedAgent?.name}</h2>
              <p>{openedTeam
                ? <><strong>{chief?.label ?? "Chief"} :</strong> {chief?.agent.name ?? "Non renseigné"} · {openedTeam.memberIds.length} membres</>
                : <>{openedAgent?.title || "Agent MAUSBOT"} · {openedAgent && hasActiveThread(openedAgent) ? "Fil actif" : "Aucun fil actif"}</>}</p>
            </div>
          </div>
        </header>

        {openedTeam && <section className="atlas-team-members" aria-label="Agents de l’équipe">
          <div className="atlas-team-members-heading"><h3>Agents de l’équipe</h3><span>{memberAgents.length} agent{memberAgents.length > 1 ? "s" : ""} visible{memberAgents.length > 1 ? "s" : ""}</span></div>
          <div className="atlas-team-member-grid">
            <button type="button" className={"atlas-team-member-card" + (selection?.kind === "team" ? " is-active" : "")}
              aria-pressed={selection?.kind === "team"}
              onClick={() => selectItem({ kind: "team", id: openedTeam.id }, threadsFor(openedTeam))}>
              <span className="atlas-team-member-icon"><Icon name="layers" /></span>
              <span><strong>Conversation d’équipe</strong><small>Canal MAUSBOT</small></span>
              <Icon name="arrow-right" />
            </button>
            {openedTeam.memberIds.map(id => {
              const agent = inventory.agents.find(item => item.id === id);
              if (!agent) return <div key={id} className="atlas-team-member-card is-unavailable">
                <span className="atlas-team-member-icon"><Icon name="shield-check" /></span>
                <span><strong>Membre non accessible</strong><small>Identité non retournée par MAUSBOT</small></span>
              </div>;
              const agentChief = chief?.agent.id === agent.id;
              return <button type="button" key={id}
                className={"atlas-team-member-card" + (selection?.kind === "agent" && selection.id === id ? " is-active" : "")}
                aria-pressed={selection?.kind === "agent" && selection.id === id}
                onClick={() => selectItem({ kind: "agent", id }, threadsFor(agent))}>
                <AgentPortrait agent={agent} workspaceId={workspaceId} className="atlas-team-member-icon" />
                <span><strong>{agent.name}</strong><small>{agentChief ? (chief?.label ?? "Chief of Staff") : agent.title || "Agent MAUSBOT"}</small></span>
                <Icon name="arrow-right" />
              </button>;
            })}
          </div>
        </section>}

        <section className={"atlas-people-console atlas-people-console-team" + (fullscreenChat ? " is-chat-fullscreen" : "")} aria-label="Conversation MAUSBOT de l’équipe">
        <div className="atlas-people-chat" id="atlas-people-conversation">
          <div className="atlas-people-chat-heading">
            <AgentPortrait agent={selectedAgent ?? (selection?.kind === "team" ? chief?.agent : null)} workspaceId={workspaceId}
              className={"atlas-people-avatar " + (selection?.kind === "team" ? "is-team" : "is-agent")} fallback={selection?.kind === "team" ? "layers" : "bot"} />
            <div className="atlas-people-chat-identity">
              <strong>{selectedName || "Conversations"}</strong>
              <small>{selection?.kind === "team" ? "Chat de la team" : selectedAgent ? selectedAgent.title || "Chat agent" : "Choisissez une équipe ou un agent"}</small>
            </div>
            <div className="atlas-people-chat-controls">
              {selected && <button type="button" className="atlas-people-icon-button" title="Actualiser les messages"
                aria-label="Actualiser les messages" disabled={!threadId || messagesBusy || !canReadMessages}
                onClick={() => setMessagesRevision(value => value + 1)}><Icon name="rotate-ccw" /></button>}
              <button type="button" className="atlas-people-icon-button atlas-people-fullscreen-toggle"
                aria-pressed={fullscreenChat} aria-label={fullscreenChat ? "Quitter le plein écran" : "Afficher la conversation en plein écran"}
                title={fullscreenChat ? "Réduire" : "Plein écran"}
                onClick={() => setFullscreenChat(value => !value)}>
                <Icon name={fullscreenChat ? "minimize" : "maximize"} />
              </button>
            </div>
          </div>
          {selected && currentThreads.length > 0 && <label className="atlas-people-thread-picker">Discussion
            <select value={threadId} onChange={event => {
              const id = event.target.value;
              setThreadId(id);
              const key = selection ? [workspaceId,selection.kind,selection.id,id].join("|") : "";
              setMessages(cachedThreadMessages(threadCache.current,key));
              setMessagesIssue("");
            }}>
              {currentThreads.map(task => <option value={task.threadId} key={task.threadId}>
                {task.title || task.threadId}{task.active ? " · actif" : ""}
              </option>)}
            </select>
          </label>}
          <div className="atlas-people-chat-body">
            {!inventory && <div className="atlas-people-zero-state" role="status">
              <span className="atlas-people-zero-symbol"><Icon name="shield-check" /></span>
              <strong>{inventoryBusy ? "Chargement de l’inventaire…" : "Le moteur attend sa connexion"}</strong>
              <p>{inventoryBusy ? "ATLAS vérifie uniquement les ressources autorisées." : disconnectedCopy}</p>
              <Link href="/engines">Voir les moteurs IA <Icon name="arrow-right" /></Link>
            </div>}
            {inventory && !selected && <div className="atlas-people-zero-state">
              <span className="atlas-people-zero-symbol"><Icon name="layers" /></span>
              <strong>Sélectionnez la conversation de l’équipe ou un agent</strong>
              <p>Choisissez un membre ou la conversation de l’équipe pour consulter les vrais messages.</p>
            </div>}
            {selected && !threadId && <div className="atlas-people-zero-state">
              <span className="atlas-people-zero-symbol"><Icon name="inbox" /></span>
              <strong>Aucun fil disponible</strong><p>Ce groupe ou cet agent ne possède pas de conversation lisible sur l’instance.</p>
            </div>}
            {selected && threadId && !canReadMessages && <div className="atlas-people-zero-state">
              <span className="atlas-people-zero-symbol"><Icon name="shield-check" /></span>
              <strong>Lecture restreinte</strong><p>Les messages sont réservés aux propriétaires et administrateurs du workspace.</p>
            </div>}
            {selected && threadId && canReadMessages && <>
              {messagesIssue && <p className="atlas-people-message-error" role="alert">Actualisation indisponible : {messagesIssue}. Les messages déjà reçus restent visibles.</p>}
              {messagesBusy && !messages.length && !messagesIssue && <p className="atlas-people-loading" role="status">Chargement des messages réels…</p>}
              {!messagesBusy && !messagesIssue && !messages.length && <div className="atlas-people-zero-state">
                <span className="atlas-people-zero-symbol"><Icon name="inbox" /></span>
                <strong>Ce fil est vide</strong><p>Aucun message n’a été retourné par MAUSBOT.</p>
              </div>}
              {!!messages.length && <ol className="atlas-people-messages" ref={scrollRef} aria-label="Messages du fil" aria-live="polite" aria-relevant="additions">
                {messages.map((message, index) => <li key={message.id ?? (message.at ?? "message") + "-" + index}
                  data-speaker={message.role === "user" ? "user" : message.role === "assistant" ? "assistant" : "event"}>
                  <div className="atlas-people-message-avatar">{message.role === "assistant"
                    ? <AgentPortrait agent={selectedAgent} workspaceId={workspaceId} fallback="bot" />
                    : <Icon name={message.role === "user" ? "grid" : "bot"} />}</div>
                  <div className="atlas-people-bubble">
                    <div className="atlas-people-message-meta"><strong>{message.role === "assistant" ? selectedAgent?.name ?? "MAUSBOT" : message.role === "user" ? "Utilisateur" : message.role || "Événement"}</strong><time>{readableTime(message.at)}</time></div>
                    {message.text && <p>{message.text}</p>}
                    {message.card && <div className="atlas-people-message-card"><strong>{message.card.title || "Carte MAUSBOT"}</strong><p>{message.card.subtitle || "Action interactive indisponible en lecture seule."}</p><small>{message.card.answered ? "Répondue" : message.card.dismissed ? "Ignorée" : message.card.expired ? "Expirée" : "Lecture seule"}</small></div>}
                    {message.tool && <details className="atlas-people-tool"><summary>{message.tool.name || "Étape outil"} {message.tool.ok === true ? "· réussi" : message.tool.ok === false ? "· échec" : ""}</summary>
                      {message.tool.spoken && <p>{message.tool.spoken}</p>}{message.tool.setup && <pre>{message.tool.setup}</pre>}{message.tool.terminal && <pre>{message.tool.terminal}</pre>}</details>}
                    {message.hasImage && <div className="atlas-people-image-unavailable"><Icon name="shield-check" /> Image non affichée : relais sécurisé requis</div>}
                    {!message.text && !message.card && !message.tool && !message.hasImage && <p>Contenu {message.kind || "non pris en charge"} indisponible.</p>}
                    {(message.queued || message.steered) && <small className="atlas-people-message-queued">{message.steered ? "Transmis au tour actif" : "En attente"}</small>}
                  </div>
                </li>)}
              </ol>}
            </>}
          </div>
          <div className="atlas-people-composer" aria-label="Composer un message MAUSBOT">
            <div className="atlas-people-composer-field"><Icon name={canSend ? "bot" : "shield-check"} />
              <textarea rows={2} aria-label="Message MAUSBOT" value={draft}
                onChange={event => setDraft(event.target.value)}
                disabled={!canSend || sending}
                placeholder={canSend ? "Écrire à cet agent ou à cette équipe…" :
                  selected ? "Lecture seule · envoi non autorisé" :
                  "Choisissez une team ou un agent"} />
            </div>
            {sendIssue && <p role="alert">{sendIssue} · Vérifiez le fil avant toute nouvelle tentative.</p>}
            <div className="atlas-people-composer-footer">
              <span><Icon name="shield-check" /> {canSend ? "Envoi sécurisé" : "Lecture seule"}</span>
              <button type="button" onClick={() => void sendMessage()} disabled={!canSend || !draft.trim() || sending}>
                <Icon name="arrow-up" /> {sending ? "Envoi…" : "Envoyer"}
              </button>
            </div>
          </div>
        </div>
        </section>
      </section>}
    </div>
  );
}
