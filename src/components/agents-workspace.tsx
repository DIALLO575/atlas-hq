"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/icon";
import { listWorkspaces } from "@/app/workspaces/actions";
import type { WorkspaceResult } from "@/lib/workspaces/contract";
import { AgentRequestForm } from "@/components/agent-request-form";

type Task = { threadId: string; title: string | null; activity: string | null; active: boolean };
type Agent = { id: string; name: string; title?: string | null; activeTaskId: string | null; tasks: Task[] };
type Team = { id: string; name: string; memberIds: string[]; activeTaskId?: string | null; tasks?: Task[] };
type Template = { slug: string; name: string; category: string | null; summary: string | null; members: number | null; featured: boolean; requiredApps: string[] };
type Inventory = { agents: Agent[]; groups: Team[]; teamTemplates: Template[]; teamCatalogAvailable: boolean };
type Message = { id: string | null; at: string | null; role: string | null; kind: string | null; text: string; hasImage?: boolean; queued?: boolean; steered?: boolean;
  tool?: { name?: string; ok?: boolean; spoken?: string; setup?: string; terminal?: string };
  card?: { title?: string; subtitle?: string; answered?: boolean; dismissed?: boolean; expired?: boolean } };
type Selection = { kind: "team" | "agent"; id: string } | null;
type RequestKind = "team" | "agent";

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
  const [proposalKind, setProposalKind] = useState<RequestKind | null>(null);
  const scrollRef = useRef<HTMLOListElement>(null);

  useEffect(() => {
    if (!proposalKind) return;
    const frame = window.requestAnimationFrame(() => document.getElementById("atlas-people-proposal")?.scrollIntoView({ behavior: "smooth", block: "start" }));
    return () => window.cancelAnimationFrame(frame);
  }, [proposalKind]);

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
          teamTemplates: Array.isArray(data.teamTemplates) ? data.teamTemplates : [],
          teamCatalogAvailable: data.teamCatalogAvailable === true,
        });
      } catch (error) {
        if (!abort.signal.aborted) setInventoryIssue(error instanceof Error ? error.message : "MAUSBOT_UNAVAILABLE");
      } finally { if (!abort.signal.aborted) setInventoryBusy(false); }
    });
    return () => abort.abort();
  }, [workspaceId, inventoryRevision]);

  const selectedTeam = selection?.kind === "team" ? inventory?.groups.find(team => team.id === selection.id) ?? null : null;
  const selectedAgent = selection?.kind === "agent" ? inventory?.agents.find(agent => agent.id === selection.id) ?? null : null;
  const selected = selectedTeam ?? selectedAgent;
  const currentThreads = useMemo(() => threadsFor(selected), [selected]);
  const selectedName = selected?.name ?? "";
  const memberAgents = selectedTeam?.memberIds.map(id => inventory?.agents.find(agent => agent.id === id)).filter((agent): agent is Agent => !!agent) ?? [];
  const normalQuery = query.trim().toLocaleLowerCase("fr");
  const visibleTeams = inventory?.groups.filter(team => team.name.toLocaleLowerCase("fr").includes(normalQuery)) ?? [];
  const visibleAgents = inventory?.agents.filter(agent =>
    (agent.name + " " + (agent.title ?? "")).toLocaleLowerCase("fr").includes(normalQuery)) ?? [];
  const activeWorkspace = spaces.status === "ready" ? spaces.workspaces.find(space => space.id === workspaceId) : null;
  const canReadMessages = activeWorkspace?.role === "owner" || activeWorkspace?.role === "admin";

  function selectItem(next: Selection, tasks: Task[]) {
    setSelection(next);
    setThreadId(tasks.find(task => task.active)?.threadId ?? tasks[0]?.threadId ?? "");
    setMessages([]);
    setMessagesIssue("");
    setMessagesBusy(false);
    if (window.matchMedia("(max-width:700px)").matches) {
      window.requestAnimationFrame(() => document.getElementById("atlas-people-conversation")?.scrollIntoView({ behavior: "smooth", block: "start" }));
    }
  }

  useEffect(() => {
    if (!workspaceId || !selection || !threadId || !canReadMessages) return;
    const abort = new AbortController();
    let reading = false;
    const load = async () => {
      if (reading || abort.signal.aborted || document.visibilityState === "hidden") return;
      reading = true;
      setMessagesBusy(true);
      try {
        const response = await fetch("/api/engines/mausbot/primitives", {
          method: "POST", credentials: "same-origin", cache: "no-store", signal: abort.signal,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            workspaceId,
            primitive: selection.kind === "team" ? "channels.messages.list" : "conversations.messages.list",
            args: selection.kind === "team"
              ? { channel_id: selection.id, task_id: threadId, limit: 50 }
              : { bot_id: selection.id, task_id: threadId, limit: 50 },
          }),
        });
        const data = await response.json();
        if (!response.ok) throw Error(typeof data.error === "string" ? data.error : "CONVERSATION_UNAVAILABLE");
        if (!Array.isArray(data.result?.messages)) throw Error("CONVERSATION_INVALID");
        if (!abort.signal.aborted) { setMessages(data.result.messages); setMessagesIssue(""); }
      } catch (error) {
        if (!abort.signal.aborted) {
          setMessages([]);
          setMessagesIssue(error instanceof Error ? error.message : "CONVERSATION_UNAVAILABLE");
        }
      } finally {
        reading = false;
        if (!abort.signal.aborted) setMessagesBusy(false);
      }
    };
    void load();
    const interval = window.setInterval(() => void load(), 5000);
    const visible = () => { if (document.visibilityState === "visible") void load(); };
    document.addEventListener("visibilitychange", visible);
    return () => { abort.abort(); window.clearInterval(interval); document.removeEventListener("visibilitychange", visible); };
  }, [workspaceId, selection, threadId, canReadMessages, messagesRevision]);

  useEffect(() => {
    if (!scrollRef.current || messagesBusy) return;
    const list = scrollRef.current;
    if (list.scrollHeight - list.scrollTop - list.clientHeight < 180) list.scrollTop = list.scrollHeight;
  }, [messages, messagesBusy]);

  const disconnectedCopy = inventoryIssue === "MAUSBOT_PRECONNECTION_GATE_CLOSED" || inventoryIssue === "MAUSBOT_NOT_CONFIGURED"
    ? "MAUSBOT n’est pas connecté à ce workspace. Identifiez l’instance et validez le gate de préconnexion pour obtenir des équipes et conversations réelles."
    : inventoryIssue ? "Inventaire indisponible : " + inventoryIssue : "L’inventaire sera affiché uniquement après lecture autorisée du moteur.";

  return (
    <div className="atlas-people-space">
      <header className="atlas-people-hero">
        <div className="atlas-people-hero-copy">
          <p className="atlas-people-overline"><Icon name="bot" /> ATLAS / COLLABORATION IA</p>
          <h1>Vos équipes. Vos agents. <span>Un même espace.</span></h1>
          <p>Parcourez vos équipes, ouvrez un agent et suivez les conversations réelles depuis ATLAS. La communication sortante attend toujours la validation du moteur.</p>
          <div className="atlas-people-hero-meta">
            <span><Icon name="shield-check" /> Lecture autorisée uniquement</span>
            <span><Icon name="activity" /> Aucun message simulé</span>
          </div>
        </div>
        <div className="atlas-people-hero-visual" aria-hidden="true">
          <span className="atlas-people-visual-back"><Icon name="layers" /></span>
          <span className="atlas-people-visual-front"><Icon name="bot" /></span>
          <span className="atlas-people-visual-orbit" />
        </div>
      </header>

      <section className="atlas-people-toolbar" aria-label="Contrôles de l’espace agents">
        <div className="atlas-people-toolbar-title">
          <span className="atlas-people-toolbar-icon"><Icon name="grid" /></span>
          <div><strong>Centre de collaboration</strong><small>Équipes, agents et fils MAUSBOT</small></div>
        </div>
        <div className="atlas-people-toolbar-actions">
          {spaces.status === "ready" && <label>Workspace
            <select value={workspaceId} onChange={event => { setQuery(""); setProposalKind(null); setWorkspaceId(event.target.value); }}>
              {spaces.workspaces.map(space => <option key={space.id} value={space.id}>{space.name}</option>)}
            </select>
          </label>}
          <span className={"atlas-people-connectivity" + (inventory ? " is-connected" : "")}>
            <span aria-hidden="true" />{inventory ? "Lecture connectée" : inventoryBusy ? "Vérification…" : "Moteur non connecté"}
          </span>
          <button type="button" className="atlas-people-icon-button" disabled={!workspaceId || inventoryBusy}
            onClick={() => setInventoryRevision(value => value + 1)} aria-label="Actualiser équipes et agents" title="Actualiser">
            <Icon name="rotate-ccw" />
          </button>
        </div>
      </section>

      {spaces.status === "error" && <p className="atlas-people-alert" role="alert">Accès aux workspaces indisponible.</p>}
      {spaces.status === "loading" && <p role="status">Chargement du workspace…</p>}
      <section className="atlas-people-console" aria-label="Espace de travail équipes et conversations">
        <aside className="atlas-people-sidebar" aria-label="Équipes et agents du workspace">
          <div className="atlas-people-sidebar-head">
            <strong>Explorer</strong>
            <span className="atlas-people-sidebar-count">{inventory ? inventory.groups.length + inventory.agents.length : "—"} éléments</span>
          </div>
          <label className="atlas-people-search"><Icon name="search" />
            <span className="sr-only">Rechercher une équipe ou un agent</span>
            <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Rechercher une équipe, un agent…" />
          </label>
          <div className="atlas-people-directory-scroll">
            <div className="atlas-people-directory-heading"><span><Icon name="layers" /> Équipes</span><small>{inventory ? visibleTeams.length : "—"}</small></div>
            {visibleTeams.map(team => <button type="button" key={team.id}
              className={"atlas-people-directory-item" + (selection?.kind === "team" && selection.id === team.id ? " is-selected" : "")}
              aria-pressed={selection?.kind === "team" && selection.id === team.id}
              onClick={() => selectItem({ kind: "team", id: team.id }, threadsFor(team))}>
              <span className="atlas-people-avatar is-team"><Icon name="layers" /></span>
              <span className="atlas-people-item-copy"><strong>{team.name}</strong><small>{team.memberIds.length} membre{team.memberIds.length > 1 ? "s" : ""} · {threadsFor(team).length} fil{threadsFor(team).length > 1 ? "s" : ""}</small></span>
              <Icon name="chevron-right" className="atlas-people-item-chevron" />
            </button>)}
            {inventory && !visibleTeams.length && <p className="atlas-people-sidebar-empty">{normalQuery ? "Aucune équipe correspondante." : "Aucune équipe retournée."}</p>}
            <div className="atlas-people-directory-heading"><span><Icon name="bot" /> Agents</span><small>{inventory ? visibleAgents.length : "—"}</small></div>
            {visibleAgents.map(agent => <button type="button" key={agent.id}
              className={"atlas-people-directory-item" + (selection?.kind === "agent" && selection.id === agent.id ? " is-selected" : "")}
              aria-pressed={selection?.kind === "agent" && selection.id === agent.id}
              onClick={() => selectItem({ kind: "agent", id: agent.id }, threadsFor(agent))}>
              <span className="atlas-people-avatar is-agent"><Icon name="bot" /></span>
              <span className="atlas-people-item-copy"><strong>{agent.name}</strong><small>{agent.title || (threadsFor(agent).length + " fils accessibles")}</small></span>
              <Icon name="chevron-right" className="atlas-people-item-chevron" />
            </button>)}
            {inventory && !visibleAgents.length && <p className="atlas-people-sidebar-empty">{normalQuery ? "Aucun agent correspondant." : "Aucun agent retourné."}</p>}
            {!inventory && <div className="atlas-people-sidebar-offline"><Icon name="shield-check" /><strong>{inventoryBusy ? "Recherche des agents…" : "Aucune liste vérifiée"}</strong><p>Les équipes et agents apparaîtront après connexion autorisée.</p></div>}
          </div>
          <div className="atlas-people-sidebar-footer">
            <button type="button" onClick={() => setProposalKind("team")}><Icon name="plus-circle" /> Proposer une équipe</button>
          </div>
        </aside>

        <div className="atlas-people-chat" id="atlas-people-conversation">
          <div className="atlas-people-chat-heading">
            <span className={"atlas-people-avatar " + (selectedTeam ? "is-team" : "is-agent")}><Icon name={selectedTeam ? "layers" : "bot"} /></span>
            <div className="atlas-people-chat-identity">
              <strong>{selectedName || "Conversations"}</strong>
              <small>{selectedTeam ? "Canal d’équipe MAUSBOT" : selectedAgent ? selectedAgent.title || "Agent MAUSBOT" : "Choisissez une équipe ou un agent"}</small>
            </div>
            {selected && <button type="button" className="atlas-people-icon-button" title="Actualiser les messages"
              aria-label="Actualiser les messages" disabled={!threadId || messagesBusy || !canReadMessages}
              onClick={() => setMessagesRevision(value => value + 1)}><Icon name="rotate-ccw" /></button>}
          </div>
          {selected && currentThreads.length > 0 && <label className="atlas-people-thread-picker">Fil de conversation
            <select value={threadId} onChange={event => { setThreadId(event.target.value); setMessages([]); setMessagesIssue(""); }}>
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
              <strong>Sélectionnez une équipe ou un agent</strong>
              <p>Ouvrez son espace pour afficher ses fils et les messages disponibles. Aucun échange fictif n’est généré.</p>
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
              {messagesIssue && <p className="atlas-people-message-error" role="alert">Lecture impossible : {messagesIssue}. Aucun historique non vérifié n’est affiché.</p>}
              {messagesBusy && !messages.length && !messagesIssue && <p className="atlas-people-loading" role="status">Chargement des messages réels…</p>}
              {!messagesBusy && !messagesIssue && !messages.length && <div className="atlas-people-zero-state">
                <span className="atlas-people-zero-symbol"><Icon name="inbox" /></span>
                <strong>Ce fil est vide</strong><p>Aucun message n’a été retourné par MAUSBOT.</p>
              </div>}
              {!!messages.length && !messagesIssue && <ol className="atlas-people-messages" ref={scrollRef} aria-label="Messages du fil" aria-live="polite" aria-relevant="additions">
                {messages.map((message, index) => <li key={message.id ?? (message.at ?? "message") + "-" + index}
                  data-speaker={message.role === "user" ? "user" : message.role === "assistant" ? "assistant" : "event"}>
                  <div className="atlas-people-message-avatar"><Icon name={message.role === "user" ? "grid" : "bot"} /></div>
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
          <div className="atlas-people-composer" aria-label="Envoi de messages verrouillé">
            <div className="atlas-people-composer-field"><Icon name="shield-check" />
              <textarea disabled rows={2} aria-label="Message verrouillé" placeholder={selected ? "Envoi désactivé jusqu’à autorisation du moteur et du worker durable" : "Sélectionnez un agent ou une équipe pour ouvrir sa conversation"} />
            </div>
            <div className="atlas-people-composer-footer">
              <span><Icon name="shield-check" /> Envoi désactivé · HTTP 423</span>
              <button type="button" disabled><Icon name="arrow-up" /> Envoyer</button>
            </div>
          </div>
        </div>

        <aside className="atlas-people-inspector" aria-label="Détails de la sélection">
          <div className="atlas-people-inspector-title"><Icon name="layers" /><strong>Informations</strong></div>
          {selected ? <>
            <span className="atlas-people-inspector-avatar"><Icon name={selectedTeam ? "layers" : "bot"} /></span>
            <h2>{selectedName}</h2>
            <p>{selectedTeam ? "Équipe MAUSBOT existante" : selectedAgent?.title || "Agent MAUSBOT existant"}</p>
            <div className="atlas-people-info-row"><span>Type</span><strong>{selectedTeam ? "Équipe" : "Agent"}</strong></div>
            <div className="atlas-people-info-row"><span>Fils visibles</span><strong>{currentThreads.length}</strong></div>
            {selectedTeam && <div className="atlas-people-info-row"><span>Membres déclarés</span><strong>{selectedTeam.memberIds.length}</strong></div>}
            <div className="atlas-people-roster">
              <h3>{selectedTeam ? "Membres" : "Équipes de cet agent"}</h3>
              {selectedTeam ? <>
                {memberAgents.map(agent => <button key={agent.id} type="button" onClick={() => selectItem({ kind: "agent", id: agent.id }, threadsFor(agent))}>
                  <span className="atlas-people-avatar is-agent"><Icon name="bot" /></span><span>{agent.name}<small>{agent.title || "Agent"}</small></span><Icon name="arrow-right" />
                </button>)}
                {selectedTeam.memberIds.length > memberAgents.length && <p>Certains membres ne sont pas visibles dans cet inventaire.</p>}
                {!selectedTeam.memberIds.length && <p>Cette équipe n’a aucun membre déclaré.</p>}
              </> : <>
                {inventory?.groups.filter(team => team.memberIds.includes(selectedAgent?.id ?? "")).map(team =>
                  <button key={team.id} type="button" onClick={() => selectItem({ kind: "team", id: team.id }, threadsFor(team))}>
                    <span className="atlas-people-avatar is-team"><Icon name="layers" /></span><span>{team.name}</span><Icon name="arrow-right" />
                  </button>)}
                {!inventory?.groups.some(team => team.memberIds.includes(selectedAgent?.id ?? "")) && <p>Aucune équipe identifiée.</p>}
              </>}
            </div>
          </> : <div className="atlas-people-inspector-empty"><Icon name="shield-check" /><strong>Accès sous contrôle</strong><p>Les identités et les appartenances proviennent exclusivement de l’inventaire autorisé.</p></div>}
          <Link href="/engines" className="atlas-people-inspector-link">Statut du moteur <Icon name="arrow-up-right" /></Link>
        </aside>
      </section>

      <div className="atlas-people-bottom">
        <section className="atlas-people-catalog">
          <div className="atlas-people-bottom-heading"><div><p className="atlas-people-overline">BIBLIOTHÈQUE</p><h2>Modèles d’équipes</h2></div><span>{inventory?.teamCatalogAvailable ? inventory.teamTemplates.length : "—"} modèles</span></div>
          {inventory?.teamCatalogAvailable && inventory.teamTemplates.length ? <div className="atlas-people-template-grid">
            {inventory.teamTemplates.map(template => <article key={template.slug}>
              <span className="atlas-people-avatar is-team"><Icon name="layers" /></span>
              <strong>{template.name}</strong><small>{template.category ?? "Équipe"}{template.members !== null ? " · " + template.members + " profils" : ""}</small>
              <p>{template.summary || "Modèle référencé par MAUSBOT."}</p>
              {!!template.requiredApps.length && <small>Applications : {template.requiredApps.join(", ")}</small>}
            </article>)}
          </div> : <p>{inventory?.teamCatalogAvailable ? "Aucun modèle retourné par l’instance." : "Le catalogue n’est pas disponible sans connexion et autorisation du moteur."}</p>}
        </section>
        <section className="atlas-people-requests">
          <div className="atlas-people-bottom-heading"><div><p className="atlas-people-overline">GOUVERNANCE</p><h2>Création sous approbation</h2></div><Icon name="shield-check" /></div>
          <p>Préparez un nouvel agent ou une équipe dans ATLAS. La demande est auditée et soumise à revue, sans créer de ressource sur MAUSBOT.</p>
          <div className="atlas-people-request-actions">
            <button type="button" aria-expanded={proposalKind === "agent"} onClick={() => setProposalKind(proposalKind === "agent" ? null : "agent")}><Icon name="plus-circle" /> Proposer un agent</button>
            <button type="button" aria-expanded={proposalKind === "team"} onClick={() => setProposalKind(proposalKind === "team" ? null : "team")}><Icon name="layers" /> Proposer une équipe</button>
          </div>
          <Link href="/engines/approvals">Voir les demandes à valider <Icon name="arrow-right" /></Link>
        </section>
      </div>
      {proposalKind && <section className="atlas-people-proposal" id="atlas-people-proposal" aria-label="Formulaire de proposition">
        <div className="atlas-people-bottom-heading"><h2>Préparer une demande</h2><button type="button" onClick={() => setProposalKind(null)} aria-label="Fermer le formulaire"><Icon name="close" /></button></div>
        <AgentRequestForm key={proposalKind} initialKind={proposalKind} />
      </section>}
    </div>
  );
}
