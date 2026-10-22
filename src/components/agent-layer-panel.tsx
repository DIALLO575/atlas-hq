"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { AgentBridgeBootstrap, AgentCreateRequest, AgentDirectoryOption, AgentMissionView, AgentResourceContext } from "@/lib/agent-bridge";
import type { MissionReceipt, MissionSnapshot } from "@/lib/agents/contracts";

type Props = { resource?: AgentResourceContext; bootstrap: AgentBridgeBootstrap };
const missionStateLabels = { queued: "En attente", running: "En cours", succeeded: "Terminée", failed: "Échec", cancelled: "Annulée", unknown: "État inconnu" } as const;
const terminalStates = new Set(["succeeded", "failed", "cancelled"]);

export function AgentLayerPanel({ resource, bootstrap }: Props) {
  const [command, setCommand] = useState("");
  const [selectedAgent, setSelectedAgent] = useState<AgentDirectoryOption | null>(null);
  const [mission, setMission] = useState<AgentMissionView | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestKey = useRef<string | null>(null);

  const mentionQuery = command.match(/(?:^|\s)@([^\s]*)$/)?.[1]?.toLocaleLowerCase("fr") ?? null;
  const suggestions = useMemo(() => mentionQuery === null ? [] : bootstrap.agents.filter((agent) => agent.identity.displayName.toLocaleLowerCase("fr").includes(mentionQuery)), [bootstrap.agents, mentionQuery]);
  const canLaunch = bootstrap.state === "ready" && Boolean(resource) && selectedAgent?.origin === "server" && selectedAgent.activation === "enabled" && selectedAgent.identity.enabled && command.trim().length > 0 && !busy;

  useEffect(() => {
    if (!mission || !["queued", "running"].includes(mission.state)) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/agent-bridge/missions/${encodeURIComponent(mission.missionId)}`, { signal: controller.signal });
        if (!response.ok) throw new Error(`État de mission indisponible (${response.status}).`);
        const snapshot = await response.json() as MissionSnapshot;
        if (snapshot.missionId !== mission.missionId) throw new Error("L’état reçu ne correspond pas à la mission demandée.");
        setMission({ missionId: snapshot.missionId, state: snapshot.state, updatedAt: snapshot.updatedAt, error: snapshot.error, result: snapshot.result });
        setError(null);
      } catch (cause) {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Impossible de lire l’état de la mission.");
      }
    }, 3000);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [mission]);

  function chooseAgent(agent: AgentDirectoryOption) {
    setSelectedAgent(agent);
    setCommand((value) => value.replace(/(?:^|\s)@[^\s]*$/, (match) => `${match.startsWith(" ") ? " " : ""}@${agent.identity.displayName} `));
  }

  async function launchMission() {
    if (!canLaunch || !resource || !selectedAgent) return;
    setBusy(true);
    setError(null);
    setMission(null);
    const payload: AgentCreateRequest = {
      agentId: selectedAgent.identity.id,
      prompt: command.trim(),
      source: resource.resource,
      idempotencyKey: requestKey.current ?? (requestKey.current = crypto.randomUUID()),
    };
    try {
      const response = await fetch("/api/agent-bridge/missions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      if (!response.ok) throw new Error(`Le serveur a refusé la mission (${response.status}).`);
      const receipt = await response.json() as MissionReceipt;
      if (!receipt.missionId || !Object.hasOwn(missionStateLabels, receipt.state)) throw new Error("Réponse Agent Bridge incomplète.");
      requestKey.current = null;
      setMission({ missionId: receipt.missionId, state: receipt.state });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Impossible de joindre Agent Bridge.");
    } finally {
      setBusy(false);
    }
  }

  return <section className="agent-layer" aria-labelledby="agent-layer-title">
    <div className="agent-layer-heading"><div><p className="eyebrow">ATLAS AGENT LAYER</p><h2 id="agent-layer-title">Demander à un agent</h2><p>Le dossier autorisé, la mission et le rapport restent liés à la ressource ouverte.</p></div><span className={`agent-bridge-state agent-bridge-${bootstrap.state}`} role="status">{bootstrap.state === "ready" ? "Bridge connecté" : bootstrap.state === "loading" ? "Chargement du Bridge…" : bootstrap.state === "error" ? "Bridge en erreur" : "Bridge indisponible"}</span></div>

    <div className="agent-layer-grid">
      <div className="agent-layer-compose">
        <label htmlFor="agent-command">Commande</label>
        <div className="agent-command-box">
          {selectedAgent && <span className="agent-mention-chip">@{selectedAgent.identity.displayName}<button type="button" aria-label={`Retirer ${selectedAgent.identity.displayName}`} onClick={() => setSelectedAgent(null)}>×</button></span>}
          <textarea id="agent-command" value={command} onChange={(event) => { setCommand(event.target.value); setError(null); }} placeholder="Écrivez une consigne et mentionnez @agent" rows={4} aria-describedby="agent-command-help" />
          {suggestions.length > 0 && <ul className="agent-suggestions" aria-label="Agents correspondants">{suggestions.map((agent) => <li key={agent.identity.id}><button type="button" onClick={() => chooseAgent(agent)}><strong>@{agent.identity.displayName}</strong><span>{agent.origin === "server" ? `Agent serveur · activation ${agent.activation}` : "Identité d’équipe connue · activation du Bridge inconnue"}</span></button></li>)}</ul>}
        </div>
        <p id="agent-command-help" className="agent-layer-help">La liste utilise les identités configurées côté serveur. La présence en direct n’est pas exposée par le contrat.</p>
        {selectedAgent && <div className="agent-recipient-summary"><span>Destinataire</span><strong>@{selectedAgent.identity.displayName}</strong><small>{selectedAgent.origin === "server" ? `Activation ${selectedAgent.activation} · disponibilité en direct inconnue` : "Identité d’équipe connue · non validée par le runtime Agent Bridge"}</small></div>}
        <button className="agent-launch-button" type="button" onClick={launchMission} disabled={!canLaunch}>{busy ? "Création de la mission…" : "Lancer la mission"}</button>
        {!canLaunch && <p className="agent-blocked-note">Lancement désactivé tant que le serveur n’a pas fourni un dossier autorisé, un destinataire activé et un transport de mission opérationnel.</p>}
        {bootstrap.reason && <p className="agent-blocked-note">{bootstrap.reason}</p>}
      </div>

      <aside className="agent-context-card" aria-label="Dossier transmis et provenance">
        <h3>Dossier transmis</h3>
        {resource ? <>
          <div className="agent-resource-heading"><span>{resource.source} · fraîcheur {resource.freshness}</span><strong>{resource.title}</strong>{resource.resource.canonicalUrl && <a href={resource.resource.canonicalUrl} target="_blank" rel="noreferrer">Ouvrir la source</a>}<small>Observé le {resource.observedAt}</small></div>
          <ul className="agent-context-fields">{resource.facts.map((fact) => <li key={fact.id}><span><strong>{fact.label}</strong><small>Accès autorisé · inclus au dossier</small><span className="agent-context-value">{fact.value}</span></span></li>)}</ul>
          {resource.attachments.length > 0 && <div className="agent-attachment-list"><strong>Pièces de contexte</strong>{resource.attachments.map((attachment) => <span key={`${attachment.kind}:${attachment.name}`}>{attachment.name} · {attachment.kind}</span>)}</div>}
        </> : <div className="agent-no-resource"><strong>Aucune ressource ouverte</strong><p>Ouvrez une PR GitHub synchronisée ou intégrez ce panneau à une fiche de ressource. Aucun contexte opérationnel n’est chargé ici.</p></div>}
        <div className="agent-access-summary"><strong>Accès source</strong><span>{resource ? "Accès confirmé par le Context Resolver" : "Aucun accès vérifié"}</span></div>
      </aside>
    </div>

    <div className="agent-mission-area" aria-live="polite">
      {busy && <p className="agent-mission-state" role="status">Agent Bridge traite la demande…</p>}
      {error && <p className="agent-mission-error" role="alert">{error} Vérifiez l’état côté serveur avant toute nouvelle tentative.</p>}
      {mission && <div className="agent-mission-state"><strong>Mission {missionStateLabels[mission.state]}</strong><span>Référence {mission.missionId} · {resource?.resource.canonicalUrl ? <a href={resource.resource.canonicalUrl}>ressource liée</a> : "ressource liée"}{mission.updatedAt && ` · mise à jour ${mission.updatedAt}`}</span>{mission.result ? <article className="agent-report"><h3>{mission.result.title}</h3><p>{mission.result.body}</p>{mission.result.canonicalUrl && <a href={mission.result.canonicalUrl}>Ouvrir le rapport lié</a>}<small>Rapport fourni par OpenMausBot · {mission.result.completedAt}</small></article> : mission.error ? <p>{mission.error.message} Aucun rapport reçu.</p> : <p>{terminalStates.has(mission.state) ? "Aucun rapport reçu." : "Aucun rapport reçu à ce stade."}</p>}</div>}
      {!busy && !error && !mission && <p className="agent-mission-empty">Aucune mission lancée. Aucun rapport n’est simulé.</p>}
    </div>
  </section>;
}
