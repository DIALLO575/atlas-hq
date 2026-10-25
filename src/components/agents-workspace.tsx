"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/icon";
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
  const [failed, setFailed] = useState(false);
  const source = agent?.hasAvatar && workspaceId
    ? "/api/engines/mausbot/avatar?workspaceId=" + encodeURIComponent(workspaceId) +
      "&botId=" + encodeURIComponent(agent.id) : null;
  useEffect(() => setFailed(false), [source]);
  return <span className={className + " atlas-agent-portrait"}>
    {source && !failed ? <Image key={source} src={source} alt="" width={64} height={64}
      unoptimized onError={() => setFailed(true)} />
      : <Icon name={fallback} />}
  </span>;
}

function readableTime(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value.slice(0, 40) : date.toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });
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
  const [fullscreenChat, setFullscreenChat] = useState(false);
  const threadCache = useRef(new Map<string,{messages: Message[]; updatedAt:number}>());
  const activeMessageKey = useRef("");
  const scrollRef = useRef<HTMLOListElement>(null);

  useEffect(() => {
    threadCache.current.clear();
    setFullscreenChat(false);
  }, [workspaceId]);

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
      setSelection(null);
      setOpenTeamId(null);
      setThreadId("");
      setMessages([]);
      setMessagesIssue("");
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
  const activeWorkspace = spaces.status === "ready" ? spaces.workspaces.find(space => space.id === workspaceId) : null;
  const canReadMessages = activeWorkspace?.role === "owner" || activeWorkspace?.role === "admin";
  const canSend = inventory?.canWrite === true && activeWorkspace?.role === "owner" && !!selected && !!threadId;
  const messageKey = workspaceId && selection && threadId
    ? [workspaceId,selection.kind,selection.id,threadId].join("|") : "";
  activeMessageKey.current = messageKey;

  function restoreCachedMessages(key: string) {
    const entry = threadCache.current.get(key);
    if (entry && Date.now() - entry.updatedAt >= MAUSBOT_THREAD_CACHE_TTL_MS) {
      threadCache.current.delete(key);
      return [];
    }
    return entry?.messages ?? [];
  }

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
    setMessages(restoreCachedMessages(key));
    setMessagesIssue("");
    setMessagesBusy(false);
    if (next?.kind === "agent" && window.matchMedia("(max-width:700px)").matches) {
      window.requestAnimationFrame(() => document.getElementById("atlas-people-conversation")?.scrollIntoView({ behavior: "smooth", block: "start" }));
    }
  }

  useEffect(() => {
    if (!workspaceId || !selection || !threadId || !canReadMessages || !messageKey) return;
    const abort = new AbortController();
    let reading = false;
    const key = messageKey;
    const cached = restoreCachedMessages(key);
    setMessages(cached);
    setMessagesIssue("");
    const load = async () => {
      if (reading || abort.signal.aborted || document.visibilityState === "hidden" ||
          navigator.onLine === false) return;
      reading = true;
      if (!threadCache.current.has(key)) setMessagesBusy(true);
      try {
        const previous = threadCache.current.get(key);
        const cursor = previous ? lastMausbotMessageId(previous.messages) : null;
        const params = new URLSearchParams({workspaceId,kind:selection.kind,
          targetId:selection.id,taskId:threadId});
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
  }, [workspaceId,selection?.kind,selection?.id,threadId,canReadMessages,messagesRevision,messageKey]);

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
          <p className="atlas-people-overline"><Icon name="layers" /> ATLAS / ÉQUIPES MAUSBOT</p>
          <h1>Vos équipes. <span>Vos agents.</span></h1>
          <p>Une équipe à la fois. Les membres, les chiefs et les conversations proviennent du moteur MAUSBOT.</p>
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
            <select value={workspaceId} onChange={event => { setQuery(""); setOpenTeamId(null); setWorkspaceId(event.target.value); }}>
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

      {inventory && !openedTeam && <section className="atlas-team-directory" aria-label="Équipes MAUSBOT">
        <div className="atlas-team-directory-heading">
          <div><p className="atlas-people-overline">VOS ÉQUIPES</p><h2>Les équipes du moteur</h2></div>
          <span>{inventory.groups.length} équipe{inventory.groups.length > 1 ? "s" : ""}</span>
        </div>
        {!!inventory.groups.length && <label className="atlas-people-search atlas-team-search">
          <Icon name="search" />
          <span className="sr-only">Chercher une équipe ou un membre</span>
          <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Rechercher une équipe ou un membre…" />
        </label>}
        <div className="atlas-team-grid">
          {visibleTeams.map(team => {
            const teamChief = chiefFor(team, inventory.agents);
            const members = team.memberIds.map(id => inventory.agents.find(agent => agent.id === id)).filter((agent): agent is Agent => Boolean(agent));
            return <button type="button" key={team.id} className="atlas-team-card"
              onClick={() => { setOpenTeamId(team.id); selectItem({ kind: "team", id: team.id }, threadsFor(team)); }}
              aria-label={"Ouvrir l’équipe " + team.name}>
              <span className="atlas-team-card-top"><AgentPortrait agent={teamChief?.agent} workspaceId={workspaceId} className="atlas-team-card-icon" fallback="layers" /><span className="atlas-team-card-eyebrow">ÉQUIPE MAUSBOT</span></span>
              <strong className="atlas-team-card-name">{team.name}</strong>
              <span className="atlas-team-chief">
                <span>{teamChief?.label ?? "Chief of Staff"}</span>
                <strong>{teamChief?.agent.name ?? "Non renseigné"}</strong>
              </span>
              <span className="atlas-team-card-members">
                {members.length ? members.slice(0, 3).map(agent => agent.name).join(" · ") : "Aucun membre nommé accessible"}
                {members.length > 3 ? " · +" + (members.length - 3) : ""}
              </span>
              <span className="atlas-team-card-footer">
                <span>{team.memberIds.length} membre{team.memberIds.length > 1 ? "s" : ""}</span>
                <span>Entrer dans l’équipe <Icon name="arrow-up-right" /></span>
              </span>
            </button>;
          })}
        </div>
        {!inventory.groups.length && <div className="atlas-team-empty"><Icon name="layers" /><div><strong>Aucune équipe MAUSBOT retournée</strong><p>Cette instance ne présente aucun canal accessible. Aucune équipe fictive n’est ajoutée.</p></div></div>}
        {inventory.groups.length > 0 && visibleTeams.length === 0 && <p className="atlas-team-no-results">Aucune équipe ne correspond à cette recherche.</p>}
      </section>}

      {inventory && openedTeam && <section className="atlas-team-detail" aria-label={"Équipe " + openedTeam.name}>
        <header className="atlas-team-detail-header">
          <button type="button" className="atlas-team-back" onClick={() => {
            setFullscreenChat(false); setOpenTeamId(null); setSelection(null); setThreadId(""); setMessages([]); setDraft(""); setSendIssue("");
          }}><Icon name="arrow-left" /> Toutes les équipes</button>
          <div className="atlas-team-detail-title">
            <span className="atlas-team-detail-mark"><Icon name="layers" /></span>
            <div>
              <p className="atlas-people-overline">ÉQUIPE MAUSBOT</p>
              <h2>{openedTeam.name}</h2>
              <p><strong>{chief?.label ?? "Chief of Staff"} :</strong> {chief?.agent.name ?? "Non renseigné"} · {openedTeam.memberIds.length} membre{openedTeam.memberIds.length > 1 ? "s" : ""}</p>
            </div>
          </div>
        </header>

        <section className="atlas-team-members" aria-label="Agents de l’équipe">
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
        </section>

        <section className={"atlas-people-console atlas-people-console-team" + (fullscreenChat ? " is-chat-fullscreen" : "")} aria-label="Conversation MAUSBOT de l’équipe">
        <div className="atlas-people-chat" id="atlas-people-conversation">
          <div className="atlas-people-chat-heading">
            <AgentPortrait agent={selectedAgent ?? (selection?.kind === "team" ? chief?.agent : null)} workspaceId={workspaceId}
              className={"atlas-people-avatar " + (selection?.kind === "team" ? "is-team" : "is-agent")} fallback={selection?.kind === "team" ? "layers" : "bot"} />
            <div className="atlas-people-chat-identity">
              <strong>{selectedName || "Conversations"}</strong>
              <small>{selection?.kind === "team" ? "Canal d’équipe MAUSBOT" : selectedAgent ? selectedAgent.title || "Agent MAUSBOT" : "Choisissez une équipe ou un agent"}</small>
            </div>
            <div className="atlas-people-chat-controls">
              {selected && <button type="button" className="atlas-people-icon-button" title="Actualiser les messages"
                aria-label="Actualiser les messages" disabled={!threadId || messagesBusy || !canReadMessages}
                onClick={() => setMessagesRevision(value => value + 1)}><Icon name="rotate-ccw" /></button>}
              <button type="button" className="atlas-people-icon-button atlas-people-fullscreen-toggle"
                aria-pressed={fullscreenChat} aria-label={fullscreenChat ? "Quitter le plein écran" : "Afficher la conversation en plein écran"}
                title={fullscreenChat ? "Réduire" : "Plein écran"}
                onClick={() => setFullscreenChat(value => !value)}>
                <Icon name={fullscreenChat ? "minimize-2" : "maximize-2"} />
              </button>
            </div>
          </div>
          {selected && currentThreads.length > 0 && <label className="atlas-people-thread-picker">Fil de conversation
            <select value={threadId} onChange={event => {
              const id = event.target.value;
              setThreadId(id);
              const key = selection ? [workspaceId,selection.kind,selection.id,id].join("|") : "";
              setMessages(restoreCachedMessages(key));
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
                  selected ? "Envoi indisponible tant que le contrôle administrateur n’est pas activé" :
                  "Sélectionnez un agent ou une équipe pour ouvrir sa conversation"} />
            </div>
            {sendIssue && <p role="alert">{sendIssue} · Vérifiez le fil avant toute nouvelle tentative.</p>}
            <div className="atlas-people-composer-footer">
              <span><Icon name="shield-check" /> {canSend ? "Envoi explicite par le propriétaire · suivi durable" : "Envoi verrouillé tant que l’autorisation manque"}</span>
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
