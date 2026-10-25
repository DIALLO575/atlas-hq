"use client";
import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { listWorkspaces } from "@/app/workspaces/actions";
import type { WorkspaceResult } from "@/lib/workspaces/contract";
type Option = { id: string; label?: string; title?: string };
type Receipt = { run_id: string; intent_digest: string; decision: string; expires_at: string };
type LiveTask = { threadId: string; title: string | null; activity: string | null; active: boolean };
type LiveAgent = { id: string; name: string; title?: string | null; activeTaskId: string | null; tasks: LiveTask[] };
type LiveGroup = { id: string; name: string; memberIds: string[]; activeTaskId?: string | null; tasks?: LiveTask[] };
type LiveTeamTemplate = { slug: string; name: string; category: string | null; summary: string | null; members: number | null; featured: boolean; requiredApps: string[] };
type LiveInventory = { agents: LiveAgent[]; groups: LiveGroup[]; teamTemplates: LiveTeamTemplate[]; teamCatalogAvailable: boolean };
type ChatMessage = { id: string | null; at: string | null; role: string | null; kind: string | null; text: string; hasImage?: boolean; steered?: boolean; queued?: boolean; tool?: { name?: string; ok?: boolean; spoken?: string; setup?: string; terminal?: string }; card?: { title?: string; subtitle?: string; answered?: boolean; dismissed?: boolean; expired?: boolean } };

export function AgentRequestForm() {
  const [kind, setKind] = useState<"agent" | "team">("agent");
  const [memberKeys, setMemberKeys] = useState(["1"]);
  const nextMember = useRef(2);
  const [spaces, setSpaces] = useState<WorkspaceResult | { status: "loading" }>({ status: "loading" });
  const [workspaceId, setWorkspace] = useState("");
  const [instances, setInstances] = useState<Option[]>([]), [missions, setMissions] = useState<Option[]>([]);
  const [inventory, setInventory] = useState<LiveInventory | null>(null);
  const [inventoryLoading, setInventoryLoading] = useState(false), [inventoryIssue, setInventoryIssue] = useState("");
  const [inventoryRevision, setInventoryRevision] = useState(0);
  const [selectedAgentId, setSelectedAgentId] = useState("");
  const [selectedChannelId, setSelectedChannelId] = useState("");
  const [selectedTaskId, setSelectedTaskId] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false), [messagesIssue, setMessagesIssue] = useState("");
  const [messagesRevision, setMessagesRevision] = useState(0);
  const [instanceId, setInstance] = useState(""), [missionId, setMission] = useState("");
  const [busy, setBusy] = useState(false), [loading, setLoading] = useState(false), [error, setError] = useState("");
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const requestId = useRef<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const generation = useRef(0);
  useEffect(() => {
    let active = true;
    void listWorkspaces().then(result => {
      if (active) { setSpaces(result); if (result.status === "ready") setWorkspace(result.selectedId); }
    }).catch(() => { if (active) setSpaces({ status: "error", message: "WORKSPACES_UNAVAILABLE" }); });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    if (!workspaceId) return;
    const abort = new AbortController();
    void Promise.resolve().then(async () => {
      if (abort.signal.aborted) return;
      setLoading(true); setError(""); setInstances([]); setMissions([]); setInstance(""); setMission(""); setReceipt(null); requestId.current = null;
      try {
        const response = await fetch("/api/engines/agent-requests?workspaceId=" + encodeURIComponent(workspaceId), { credentials: "same-origin", cache: "no-store", signal: abort.signal });
        const data = await response.json();
        if (!response.ok) throw Error("Le contexte de préparation n’est pas disponible pour ce workspace.");
        if (!abort.signal.aborted) {
          setInstances(data.instances ?? []); setMissions(data.missions ?? []);
          setInstance(data.instances?.[0]?.id ?? ""); setMission(data.missions?.[0]?.id ?? "");
        }
      } catch { if (!abort.signal.aborted) setError("Impossible de charger les missions et instances accessibles."); }
      finally { if (!abort.signal.aborted) setLoading(false); }
    });
    return () => abort.abort();
  }, [workspaceId]);
  useEffect(() => {
    if (!workspaceId) return;
    const abort = new AbortController();
    void Promise.resolve().then(async () => {
      if (abort.signal.aborted) return;
      setInventory(null); setInventoryIssue(""); setInventoryLoading(true);
      try {
        const response = await fetch(`/api/engines/mausbot?workspaceId=${encodeURIComponent(workspaceId)}&view=inventory`, {
          credentials: "same-origin", cache: "no-store", signal: abort.signal,
        });
        const data = await response.json();
        if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "MAUSBOT_UNAVAILABLE");
        if (!abort.signal.aborted) setInventory({
          agents: Array.isArray(data.agents) ? data.agents : [],
          groups: Array.isArray(data.groups) ? data.groups : [],
          teamTemplates: Array.isArray(data.teamTemplates) ? data.teamTemplates : [],
          teamCatalogAvailable: data.teamCatalogAvailable === true,
        });
      } catch (error) {
        if (!abort.signal.aborted) setInventoryIssue(error instanceof Error ? error.message : "MAUSBOT_UNAVAILABLE");
      } finally { if (!abort.signal.aborted) setInventoryLoading(false); }
    });
    return () => abort.abort();
  }, [workspaceId, inventoryRevision]);
  const selectedAgent = inventory?.agents.find(agent => agent.id === selectedAgentId) ?? null;
  const selectedChannel = inventory?.groups.find(group => group.id === selectedChannelId) ?? null;
  useEffect(() => {
    if (!workspaceId || (!selectedAgentId && !selectedChannelId) || !selectedTaskId) return;
    const abort = new AbortController();
    const loadMessages = async (initial = false) => {
      try {
        const response = await fetch("/api/engines/mausbot/primitives", {
          method: "POST", credentials: "same-origin", cache: "no-store", signal: abort.signal,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ workspaceId,
            primitive: selectedChannelId ? "channels.messages.list" : "conversations.messages.list",
            args: selectedChannelId ? { channel_id: selectedChannelId, task_id: selectedTaskId, limit: 50 }
              : { bot_id: selectedAgentId, task_id: selectedTaskId, limit: 50 },
          }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "CONVERSATION_UNAVAILABLE");
        if (!abort.signal.aborted) {
          setMessages(Array.isArray(data.result?.messages) ? data.result.messages as ChatMessage[] : []);
          setMessagesIssue("");
        }
      } catch (error) {
        if (!abort.signal.aborted && initial) setMessagesIssue(error instanceof Error ? error.message : "CONVERSATION_UNAVAILABLE");
      } finally { if (!abort.signal.aborted && initial) setMessagesLoading(false); }
    };
    void Promise.resolve().then(() => {
      if (abort.signal.aborted) return;
      setMessagesIssue(""); setMessagesLoading(true);
      void loadMessages(true);
    });
    const timer = window.setInterval(() => void loadMessages(false), 5000);
    const onVisible = () => { if (document.visibilityState === "visible") void loadMessages(false); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { abort.abort(); window.clearInterval(timer); document.removeEventListener("visibilitychange", onVisible); };
  }, [workspaceId, selectedAgentId, selectedChannelId, selectedTaskId, messagesRevision]);
  function openConversation(agent: LiveAgent) {
    const availableTasks = [...new Set([agent.activeTaskId, ...agent.tasks.map(task => task.threadId)].filter((id): id is string => !!id))];
    setSelectedAgentId(agent.id);
    setSelectedChannelId("");
    setSelectedTaskId(agent.activeTaskId && availableTasks.includes(agent.activeTaskId) ? agent.activeTaskId : availableTasks[0] ?? "");
    setMessages([]); setMessagesIssue("");
    window.setTimeout(() => document.getElementById("mausbot-conversation")?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 0);
  }
  function openChannel(channel: LiveGroup) {
    const channelTasks = [...new Set([channel.activeTaskId, ...(channel.tasks ?? []).map(task => task.threadId)].filter((id): id is string => !!id))];
    setSelectedAgentId(""); setSelectedChannelId(channel.id);
    setSelectedTaskId(channelTasks[0] ?? ""); setMessages([]); setMessagesIssue("");
    window.setTimeout(() => document.getElementById("mausbot-conversation")?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 0);
  }
  const groupedAgentIds = new Set(inventory?.groups.flatMap(group => group.memberIds) ?? []);
  const activeTasks = selectedAgent?.tasks ?? selectedChannel?.tasks ?? [];
  const activeTaskId = selectedAgent?.activeTaskId ?? selectedChannel?.activeTaskId ?? null;
  const conversationTasks = selectedAgent || selectedChannel
    ? [...new Map([...activeTasks, ...(activeTaskId && !activeTasks.some(task => task.threadId === activeTaskId)
      ? [{ threadId: activeTaskId, title: "Conversation active", activity: null, active: true }] : [])]
      .map(task => [task.threadId, task])).values()]
    : [];
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || loading || receipt || !instanceId || !missionId) return;
    const form = new FormData(event.currentTarget);
    const snapshot = generation.current;
    requestId.current ??= crypto.randomUUID();
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/engines/" + kind + "-requests", {
        method: "POST", credentials: "same-origin", cache: "no-store", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId, instanceId, missionId, requestId: requestId.current,
          ...(kind === "agent" ? { name: form.get("name"), title: form.get("title"), description: form.get("description") }
          : { manifest: { format: "openmaus.team", version: 2, team: { name: form.get("name"), description: form.get("description"),
            members: memberKeys.map(key => ({ key: form.get(`member-${key}-key`), name: form.get(`member-${key}-name`),
              title: form.get(`member-${key}-title`), description: form.get(`member-${key}-description`), appearance: { color: form.get(`member-${key}-color`) } })),
          } } }) }),
      });
      const data = await response.json();
      if (!response.ok || data.canDispatch !== false || !data.request?.run_id) throw Error(data.error === "TEAM_REQUEST_MANIFEST_INVALID" ? "PROFILE_INVALID" : "REQUEST_UNAVAILABLE");
      if (snapshot === generation.current) setReceipt(data.request);
    } catch (cause) { if (snapshot === generation.current) setError(cause instanceof Error && cause.message === "PROFILE_INVALID"
      ? "Vérifiez les profils : identifiants uniques, noms, couleurs et tailles des descriptions."
      : "Demande non confirmée. Réessayez sans modifier le formulaire pour conserver la même référence."); }
    finally { if (snapshot === generation.current) setBusy(false); }
  }
  return <section className="agent-request-panel" aria-labelledby="agent-request-heading">
    <section className="mausbot-live-inventory" aria-labelledby="mausbot-live-heading">
      <div className="mausbot-live-heading">
        <div><p className="mausbot-live-eyebrow">CONNEXION MAUSBOT</p><h2 id="mausbot-live-heading">Bots, groupes et équipes disponibles</h2></div>
        <div className="mausbot-live-heading-actions">
          <span className={inventory ? "mausbot-live-state is-live" : "mausbot-live-state"}>
            {inventory ? "Lecture réelle · sans écriture" : inventoryLoading ? "Vérification…" : "Non connecté"}
          </span>
          <button type="button" disabled={!workspaceId || inventoryLoading} onClick={() => setInventoryRevision(value => value + 1)}>
            {inventoryLoading ? "Lecture…" : "Actualiser"}
          </button>
        </div>
      </div>
      {inventoryLoading && <p role="status">Lecture de l’inventaire MAUSBOT…</p>}
      {!inventory && !inventoryLoading && <p className="mausbot-live-note">
        {inventoryIssue === "MAUSBOT_PRECONNECTION_GATE_CLOSED" || inventoryIssue === "MAUSBOT_NOT_CONFIGURED"
          ? "Aucun inventaire fictif. Configurez l’accès serveur MAUSBOT et le mode de lecture seule pour afficher les données du workspace."
          : inventoryIssue ? `Inventaire indisponible (${inventoryIssue}). Vérifiez la connexion serveur MAUSBOT.`
          : "Aucun moteur MAUSBOT en lecture seule n’est configuré pour ce workspace."}
      </p>}
      {inventory && <>
        <p className="mausbot-live-note">Données lues depuis l’instance MAUSBOT. Les demandes ci-dessous restent des demandes de revue : elles ne créent ni bot ni groupe dans le moteur.</p>
        <div className="mausbot-team-directory">
          <div className="mausbot-live-subheading"><h3 id="mausbot-groups-heading">Équipes MAUSBOT</h3><strong>{inventory.groups.length}</strong></div>
          {inventory.groups.length ? <div className="mausbot-team-list">{inventory.groups.map(group => {
            const members = group.memberIds.map(id => inventory.agents.find(agent => agent.id === id)).filter((agent): agent is LiveAgent => agent !== undefined);
            return <details className="mausbot-team-card" key={group.id}>
              <summary><span className="mausbot-live-avatar" aria-hidden="true">▦</span><span className="mausbot-team-summary"><strong>{group.name}</strong>
                <small>{members.length} bot{members.length === 1 ? "" : "s"} · groupe MAUSBOT</small></span><span className="mausbot-team-chevron" aria-hidden="true">⌄</span></summary>
              <div className="mausbot-team-content"><p className="mausbot-team-description">Bots affectés à cette équipe sur l’instance MAUSBOT.</p>
                <button type="button" className="mausbot-open-channel" disabled={!group.activeTaskId && !group.tasks?.length} onClick={() => openChannel(group)}>{group.activeTaskId || group.tasks?.length ? "Ouvrir le chat de l’équipe" : "Aucun fil d’équipe lisible"}</button>
                {members.length ? <ul className="mausbot-member-list">{members.map(agent => <li key={agent.id}>
                  <span><strong>{agent.name}</strong>{agent.title && <small>{agent.title}</small>}</span>
                  <button type="button" onClick={() => openConversation(agent)}>Voir les échanges</button>
                </li>)}</ul> : <p className="mausbot-live-empty">Aucun bot trouvé dans les membres de ce groupe.</p>}
                <code className="mausbot-team-id">{group.id}</code>
              </div>
            </details>;
          })}</div> : <p className="mausbot-live-empty">Aucun groupe renvoyé par MAUSBOT.</p>}
        </div>
        <section className="mausbot-unassigned-section" aria-labelledby="mausbot-unassigned-heading">
          <div className="mausbot-live-subheading"><h3 id="mausbot-unassigned-heading">Bots hors équipe</h3>
            <strong>{inventory.agents.filter(agent => !groupedAgentIds.has(agent.id)).length}</strong></div>
          {inventory.agents.filter(agent => !groupedAgentIds.has(agent.id)).length ? <ul className="mausbot-member-list">
            {inventory.agents.filter(agent => !groupedAgentIds.has(agent.id)).map(agent => <li key={agent.id}>
              <span><strong>{agent.name}</strong>{agent.title && <small>{agent.title}</small>}</span>
              <button type="button" onClick={() => openConversation(agent)}>Voir les échanges</button>
            </li>)}
          </ul> : <p className="mausbot-live-empty">Tous les bots renvoyés sont rattachés à une équipe.</p>}
        </section>
        <section className="mausbot-template-list" aria-labelledby="mausbot-teams-heading">
          <div className="mausbot-live-subheading"><h3 id="mausbot-teams-heading">Modèles d’équipe disponibles</h3>
            <strong>{inventory.teamCatalogAvailable ? inventory.teamTemplates.length : "—"}</strong></div>
          {!inventory.teamCatalogAvailable ? <p className="mausbot-live-empty">Le catalogue d’équipes n’est pas exposé par cette instance.</p>
            : inventory.teamTemplates.length ? <ul className="mausbot-template-cards">{inventory.teamTemplates.map(team => <li key={team.slug}>
              <strong>{team.name}</strong><small>{team.category ?? "Équipe"}{team.members !== null ? ` · ${team.members} profils` : ""}</small>
              {team.summary && <p>{team.summary}</p>}{team.requiredApps.length > 0 && <small>Apps requises : {team.requiredApps.join(", ")}</small>}
            </li>)}</ul> : <p className="mausbot-live-empty">Aucun modèle d’équipe disponible.</p>}
        </section>
        <section className="mausbot-conversation-panel" id="mausbot-conversation" aria-labelledby="mausbot-conversation-heading">
          <div className="mausbot-live-heading">
            <div><p className="mausbot-live-eyebrow">MESSAGERIE MAUSBOT · LECTURE PROTÉGÉE</p>
              <h3 id="mausbot-conversation-heading">{selectedAgent ? `Chat · ${selectedAgent.name}` : selectedChannel ? `Chat équipe · ${selectedChannel.name}` : "Choisis une équipe ou un bot"}</h3></div>
            {(selectedAgent || selectedChannel) && <button type="button" disabled={!selectedTaskId || messagesLoading} onClick={() => setMessagesRevision(value => value + 1)}>
              {messagesLoading ? "Lecture…" : "Actualiser"}</button>}
          </div>
          {(selectedAgent || selectedChannel) && conversationTasks.length > 1 && <label className="mausbot-task-picker">Conversation
            <select value={selectedTaskId} onChange={event => setSelectedTaskId(event.target.value)}>
              {conversationTasks.map(task => <option key={task.threadId} value={task.threadId}>{task.title || task.threadId}{task.active ? " · active" : ""}</option>)}
            </select>
          </label>}
          {!selectedAgent && !selectedChannel && <p className="mausbot-live-empty">Ouvre le chat d’une équipe ou choisis un bot pour consulter le fil.</p>}
          {selectedChannel && !selectedTaskId && <p className="mausbot-live-empty">Cette équipe ne renvoie aucun fil lisible.</p>}
          {selectedAgent && !selectedTaskId && <p className="mausbot-live-empty">Ce bot ne renvoie aucun fil de conversation lisible.</p>}
          {(selectedAgent || selectedChannel) && selectedTaskId && messagesLoading && <p role="status">Lecture des messages…</p>}
          {(selectedAgent || selectedChannel) && selectedTaskId && messagesIssue && <p role="alert">{messagesIssue === "ENGINE_WRITE_FORBIDDEN"
            ? "La lecture du contenu est réservée aux propriétaires et administrateurs du workspace."
            : `Conversation indisponible (${messagesIssue}).`}</p>}
          {(selectedAgent || selectedChannel) && selectedTaskId && !messagesLoading && !messagesIssue && <ol className="mausbot-message-list" aria-live="polite" aria-relevant="additions text">
            {messages.map((message, index) => <li key={message.id ?? `${message.at ?? "message"}-${index}`} data-role={message.role === "assistant" ? "bot" : message.role === "user" ? "human" : "other"}>
              <small>{message.role === "assistant" ? selectedAgent?.name ?? "MAUSBOT" : message.role === "user" ? "ATLAS / utilisateur" : message.role ?? "Message"}{message.at ? ` · ${message.at}` : ""}</small>
              {message.text ? <p>{message.text}</p> : null}
              {message.card && <aside className="mausbot-message-card"><strong>{message.card.title ?? "Carte MAUSBOT"}</strong>{message.card.subtitle && <p>{message.card.subtitle}</p>}
                <small>{message.card.answered ? "Répondue" : message.card.dismissed ? "Ignorée" : message.card.expired ? "Expirée" : "Carte interactive (lecture seule dans ATLAS)"}</small></aside>}
              {message.tool && <details className="mausbot-tool-detail"><summary>{message.tool.name ?? "Étape de l’agent"} {message.tool.ok === false ? "· échec" : message.tool.ok === true ? "· terminé" : ""}</summary>
                {message.tool.spoken && <p>{message.tool.spoken}</p>}{message.tool.setup && <pre>{message.tool.setup}</pre>}{message.tool.terminal && <pre>{message.tool.terminal}</pre>}</details>}
              {message.hasImage && <div className="mausbot-media-placeholder" role="img" aria-label="Image MAUSBOT disponible, aperçu protégé"><span aria-hidden="true">▧</span><span>Aperçu image en attente du relais média sécurisé</span></div>}
              {!message.text && !message.card && !message.tool && !message.hasImage && <p className="mausbot-message-attachment">Message de type {message.kind ?? "inconnu"} · rendu non pris en charge</p>}
              {(message.queued || message.steered) && <small className="mausbot-message-state">{message.steered ? "Transmis au tour actif" : "En file d’attente"}</small>}
            </li>)}
            {!messages.length && <li className="mausbot-live-empty">Aucun message dans ce fil.</li>}
          </ol>}
          <div className="mausbot-chat-composer">
            <label htmlFor="mausbot-message-draft">Message vers MAUSBOT</label>
            <textarea id="mausbot-message-draft" rows={2} maxLength={4000} disabled placeholder="L’envoi sera activé après la livraison du worker durable." />
            <button type="button" disabled>Envoi verrouillé</button>
            <small>Le chat se rafraîchit automatiquement toutes les 5 secondes. L’envoi attend le worker durable et son contrôle d’approbation; aucun message n’est transmis depuis ATLAS pour le moment.</small>
          </div>
        </section>
        <div className="mausbot-live-actions"><span>Création et modification moteur : verrouillées jusqu’au worker durable et à sa validation.</span>
          <button type="button" onClick={() => { setKind("team"); requestId.current = null; setReceipt(null); document.getElementById("agent-request-heading")?.scrollIntoView({ behavior: "smooth", block: "start" }); }}>Proposer une équipe pour revue</button>
        </div>
      </>}
    </section>
    <h2 id="agent-request-heading">{kind === "agent" ? "Demander la création d’un bot" : "Demander la création d’une équipe"}</h2>
    <div role="group" aria-label="Type de demande">{(["agent", "team"] as const).map(value => <button key={value} type="button" disabled={busy}
      aria-pressed={kind === value} onClick={() => { generation.current++; requestId.current = null; setReceipt(null); setError(""); setMemberKeys(["1"]); nextMember.current = 2; setKind(value); }}>
      {value === "agent" ? "Agent" : "Équipe"}</button>)}</div>
    <p>La demande sera auditée dans ATLAS puis soumise à revue. L’approbation n’active pas encore la création côté MAUSBOT : le worker durable reste à livrer.</p>
    {spaces.status === "ready" ? <>
      <label htmlFor="agent-workspace">Workspace</label>
      <select id="agent-workspace" value={workspaceId} disabled={busy} onChange={event => { generation.current++; setReceipt(null); setInstances([]); setMissions([]); setInventory(null); setSelectedAgentId(""); setSelectedChannelId(""); setSelectedTaskId(""); setMessages([]); setMessagesIssue(""); setLoading(true); setWorkspace(event.target.value); }}>
        {spaces.workspaces.map(space => <option key={space.id} value={space.id}>{space.name}</option>)}
      </select>
      {loading ? <p role="status">Chargement…</p> : !instances.length || !missions.length ?
        <p>Une instance MAUSBOT hors ligne et une mission planifiée ou active sont nécessaires. <Link href="/missions">Ouvrir les missions</Link> · <Link href="/engines">Ouvrir les moteurs</Link></p> :
        <form key={kind} ref={formRef} onSubmit={event => void submit(event)} onChange={() => { if (!busy && !receipt) requestId.current = null; }}>
          <fieldset disabled={busy || !!receipt}>
            <legend>Profil proposé</legend>
            <label htmlFor="agent-instance">Instance hors ligne</label>
            <select id="agent-instance" value={instanceId} onChange={event => setInstance(event.target.value)}>{instances.map(instance => <option key={instance.id} value={instance.id}>{instance.label}</option>)}</select>
            <label htmlFor="agent-mission">Mission ATLAS</label>
            <select id="agent-mission" value={missionId} onChange={event => setMission(event.target.value)}>{missions.map(mission => <option key={mission.id} value={mission.id}>{mission.title}</option>)}</select>
            <label htmlFor="agent-name">Nom</label><input id="agent-name" name="name" required maxLength={100} />
            {kind === "agent" ? <><label htmlFor="agent-title">Rôle</label><input id="agent-title" name="title" maxLength={200} /></> : null}
            <label htmlFor="agent-description">Description — sans identifiant ni secret</label><textarea id="agent-description" name="description" maxLength={1000} rows={4} />
            {kind === "team" ? <div>
              <h3>Membres proposés ({memberKeys.length}/12)</h3>
              <p>Profils uniquement. Aucun outil, modèle ou permission n’est attribué ici.</p>
              {memberKeys.map((key, index) => <fieldset key={key} className="team-member-fields">
                <legend>Membre {index + 1}</legend>
                <label htmlFor={`member-${key}-key`}>Identifiant du profil</label><input id={`member-${key}-key`} name={`member-${key}-key`} defaultValue={`agent-${key}`} required maxLength={64} pattern="[a-z0-9][a-z0-9_-]*" />
                <label htmlFor={`member-${key}-name`}>Nom</label><input id={`member-${key}-name`} name={`member-${key}-name`} required maxLength={100} />
                <label htmlFor={`member-${key}-title`}>Rôle</label><input id={`member-${key}-title`} name={`member-${key}-title`} maxLength={200} />
                <label htmlFor={`member-${key}-description`}>Description</label><textarea id={`member-${key}-description`} name={`member-${key}-description`} maxLength={1000} rows={2} />
                <label htmlFor={`member-${key}-color`}>Couleur</label><select id={`member-${key}-color`} name={`member-${key}-color`} defaultValue="blue">
                  {[["blue","Bleu"],["green","Vert"],["red","Rouge"],["orange","Orange"],["purple","Violet"],["cyan","Cyan"],["pink","Rose"],["yellow","Jaune"],["teal","Turquoise"],["coral","Corail"],["silver","Argent"],["chrome","Chrome"]].map(([value,label]) => <option key={value} value={value}>{label}</option>)}
                </select>
                <button type="button" disabled={memberKeys.length === 1} onClick={() => { requestId.current = null; setMemberKeys(keys => keys.filter(value => value !== key)); }}>Retirer ce profil</button>
              </fieldset>)}
              <button type="button" disabled={memberKeys.length >= 12} onClick={() => { requestId.current = null; const key = String(nextMember.current++); setMemberKeys(keys => [...keys,key]); }}>Ajouter un membre</button>
            </div> : null}
            <button type="submit">{busy ? "Enregistrement…" : "Demander la revue"}</button>
          </fieldset>
        </form>}
      {receipt ? <div role="status"><p>Demande enregistrée : {receipt.decision === "pending" ? "en attente de revue" : receipt.decision}. Aucune création MAUSBOT effectuée.</p>
        <p>Référence : <code>{receipt.run_id}</code></p><Link href="/engines/approvals">Ouvrir les demandes à valider</Link>
        <button type="button" onClick={() => { formRef.current?.reset(); setMemberKeys(["1"]); nextMember.current = 2; requestId.current = null; setReceipt(null); setError(""); }}>Préparer un autre profil</button></div> : null}
      {error ? <p role="alert">{error}</p> : null}
    </> : <p role="status">Connectez-vous à un workspace pour préparer un agent.</p>}
  </section>;
}
