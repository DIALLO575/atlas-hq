"use client";

import { useEffect, useState, type FormEvent } from "react";
import { listWorkspaces } from "@/app/workspaces/actions";
import type { Workspace, WorkspaceResult } from "@/lib/workspaces/contract";

type Engine = {
  id: string; name: string; description: string; phase: string;
  status: "planned" | "configured" | "preconnection" | "not-configured";
  transports: string[]; capabilities: string[];
};
type Agent = { id: string; name: string; emoji: string | null };
type Dispatch = { accepted: boolean; taskCreated?: boolean; threadId?: string; sendId?: string; error?: string };
type Job = { status: string | null; state: string | null; phase: string | null; version: number | null };
type WorkspaceState = WorkspaceResult | { status: "loading" };
type PrimitiveCoverage = { mappedMcp: number; native: number; nativeFamilies: Record<string,number>; callableNative: number; testedLive: number; mockTestedReads: number; validatedMutationPlans: number; validatedBinaryPlans: number };

async function readResponse(url: string, init?: RequestInit) {
  const result = await fetch(url, { cache: "no-store", credentials: "same-origin", ...init });
  const data = await result.json() as Record<string, unknown>;
  if (!result.ok) throw new Error(typeof data.error === "string" ? data.error : "SERVICE_UNAVAILABLE");
  return data;
}

export function EnginesHub() {
  const [wsState, setWsState] = useState<WorkspaceState>({ status: "loading" });
  const [primitiveCoverage, setPrimitiveCoverage] = useState<PrimitiveCoverage | null>(null);
  const [workspaceId, setWorkspaceId] = useState("");
  const [engines, setEngines] = useState<Engine[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [engineOnline, setEngineOnline] = useState(false);
  const [loading, setLoading] = useState(false);
  const [issue, setIssue] = useState<string | null>(null);
  const [refreshCounter, setRefreshCounter] = useState(0);
  const [botId, setBotId] = useState("");
  const [title, setTitle] = useState("");
  const [instruction, setInstruction] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [dispatch, setDispatch] = useState<Dispatch | null>(null);
  const [job, setJob] = useState<Job | null>(null);
  const [jobIssue, setJobIssue] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void listWorkspaces().then((data) => {
      if (!active) return;
      setWsState(data);
      if (data.status === "ready") setWorkspaceId(data.selectedId);
    }).catch(() => { if (active) setWsState({ status: "error", message: "WORKSPACES_UNAVAILABLE" }); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!workspaceId) return;
    const abort = new AbortController();
    const url = "/api/engines?workspaceId=" + encodeURIComponent(workspaceId);
    void Promise.resolve().then(async () => {
      if (abort.signal.aborted) return;
      setLoading(true);
      setIssue(null);
      setEngines([]);
      setPrimitiveCoverage(null);
      setAgents([]);
      setBotId("");
      setDispatch(null);
      setJob(null);
      setEngineOnline(false);
      try {
        const catalog = await readResponse(url, { signal: abort.signal });
        if (abort.signal.aborted) return;
        const entries = Array.isArray(catalog.engines) ? catalog.engines as Engine[] : [];
        setEngines(entries);
        const preview = await readResponse("/api/engines/mausbot/primitives?workspaceId=" +
          encodeURIComponent(workspaceId), { signal: abort.signal });
        if (abort.signal.aborted) return;
        const nativeCoverage = preview.nativeCoverage as Record<string, unknown> | undefined;
        setPrimitiveCoverage({
          mappedMcp: Array.isArray(preview.primitives) ? preview.primitives.length : 0,
          native: typeof nativeCoverage?.total === "number" ? nativeCoverage.total : 0,
          nativeFamilies: nativeCoverage?.byFamily && typeof nativeCoverage.byFamily === "object"
            ? nativeCoverage.byFamily as Record<string, number> : {},
          callableNative: typeof nativeCoverage?.callable === "number" ? nativeCoverage.callable : 0,
          testedLive: typeof nativeCoverage?.testedLive === "number" ? nativeCoverage.testedLive : 0,
          mockTestedReads: typeof nativeCoverage?.mockTestedReads === "number" ? nativeCoverage.mockTestedReads : 0,
          validatedMutationPlans: typeof nativeCoverage?.validatedMutationPlans === "number" ? nativeCoverage.validatedMutationPlans : 0,
          validatedBinaryPlans: typeof nativeCoverage?.validatedBinaryPlans === "number" ? nativeCoverage.validatedBinaryPlans : 0,
        });
        if (entries.find((engine) => engine.id === "mausbot")?.status !== "configured") return;
        const base = "/api/engines/mausbot?workspaceId=" + encodeURIComponent(workspaceId);
        await readResponse(base + "&view=health", { signal: abort.signal });
        if (abort.signal.aborted) return;
        setEngineOnline(true);
        const agentsData = await readResponse(base + "&view=agents", { signal: abort.signal });
        if (abort.signal.aborted) return;
        const items = Array.isArray(agentsData.agents) ? agentsData.agents as Agent[] : [];
        setAgents(items);
        setBotId(items[0]?.id ?? "");
      } catch (error) {
        if (!abort.signal.aborted) setIssue(error instanceof Error ? error.message : "ENGINE_UNAVAILABLE");
      } finally {
        if (!abort.signal.aborted) setLoading(false);
      }
    });
    return () => abort.abort();
  }, [workspaceId, refreshCounter]);

  const activeWorkspace: Workspace | undefined = wsState.status === "ready"
    ? wsState.workspaces.find((ws) => ws.id === workspaceId) : undefined;
  const activeEngine = engines.find((engine) => engine.id === "mausbot");

  async function submitMission(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!workspaceId || !botId || !title.trim() || !instruction.trim() || submitting) return;
    setSubmitting(true);
    setDispatch(null);
    setJob(null);
    setJobIssue(null);
    try {
      const response = await fetch("/api/engines/mausbot/dispatch", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId, botId, title, instruction }),
      });
      const result = await response.json() as Dispatch;
      // Preserve partial-task information even when sending fails.
      setDispatch(result);
      if (response.ok && result.accepted) {
        setInstruction("");
        setTitle("");
      }
    } catch {
      setDispatch({ accepted: false, error: "NETWORK_ERROR_CHECK_MAUSBOT_BEFORE_RETRY" });
    } finally {
      setSubmitting(false);
    }
  }

  async function inspectJob(threadId: string) {
    setJobIssue(null);
    try {
      const data = await readResponse("/api/engines/mausbot?workspaceId=" +
        encodeURIComponent(workspaceId) + "&view=job&threadId=" + encodeURIComponent(threadId));
      setJob(data.job as Job);
    } catch (error) {
      setJobIssue(error instanceof Error ? error.message : "JOB_UNAVAILABLE");
    }
  }

  return (
    <div className="atlas-engine-hub">
      <section className="atlas-engine-toolbar" aria-label="Workspace des moteurs">
        <div><strong>Registre des moteurs</strong><p>Les moteurs exécutent les agents. Les Apps apportent leurs outils et leur contexte.</p></div>
        <div className="atlas-engine-toolbar-actions">
          {wsState.status === "ready" && (
            <label>Workspace
              <select value={workspaceId} onChange={(event) => setWorkspaceId(event.target.value)}>
                {wsState.workspaces.map((ws) => <option key={ws.id} value={ws.id}>{ws.name}</option>)}
              </select>
            </label>
          )}
          <button type="button" disabled={!workspaceId || loading} onClick={() => setRefreshCounter((x) => x + 1)}>
            {loading ? "Vérification…" : "Actualiser"}
          </button>
        </div>
      </section>

      {wsState.status === "loading" && <p role="status">Chargement des workspaces…</p>}
      {wsState.status === "error" && <p role="alert">Accès aux workspaces indisponible.</p>}
      {wsState.status === "ready" && !activeWorkspace && <p role="status">Aucun workspace accessible.</p>}
      {issue && <p className="atlas-engine-warning" role="alert">Connexion ou lecture impossible : {issue}. Aucun agent fictif n’est affiché.</p>}

      <div className="atlas-engine-grid">
        {(engines.length ? engines : [
          { id: "mausbot", name: "MAUSBOT", description: "Premier moteur", phase: "adapter-v0", status: "not-configured", transports: [], capabilities: [] },
          { id: "hermes", name: "Hermes", description: "Futur moteur", phase: "planned", status: "planned", transports: [], capabilities: [] },
        ]).map((engine) => (
          <article className="atlas-engine-card" key={engine.id}>
            <div className="atlas-engine-card-top">
              <span className="atlas-engine-symbol" aria-hidden="true">{engine.id === "mausbot" ? "M" : "H"}</span>
              <span className="atlas-engine-status" data-state={engine.id === "mausbot" && engineOnline ? "online" : engine.status}>
                {engine.id === "mausbot" && engineOnline ? "En ligne"
                  : engine.status === "configured" ? "Configuré · à vérifier"
                  : engine.status === "preconnection" ? "Préconnexion · verrouillée"
                  : engine.status === "planned" ? "Prévu" : "Non connecté"}
              </span>
            </div>
            <h2>{engine.name}</h2>
            <p>{engine.description}</p>
            <div className="atlas-engine-chips">
              {engine.transports.map((transport) => <span key={transport}>{transport.toUpperCase()}</span>)}
            </div>
          </article>
        ))}
      </div>

      {primitiveCoverage && (
        <section className="atlas-engine-panel atlas-engine-capability-panel" aria-label="Inventaire hors connexion">
          <div className="atlas-engine-section-heading">
            <div><h2>Primitives MAUSBOT — inventaire préconnexion</h2>
              <p>Capacités cartographiées depuis le code source, pas des fonctionnalités déjà validées sur votre instance.</p></div>
            <strong>Sans moteur connecté</strong>
          </div>
          <div className="atlas-engine-coverage-counts">
            <div><strong>{primitiveCoverage.mappedMcp}</strong><span>contrats MCP + mappings HTTP testés</span></div>
            <div><strong>{primitiveCoverage.native}</strong><span>capacités HTTP natives cartographiées</span></div>
            <div><strong>{primitiveCoverage.callableNative}</strong><span>primitives natives ouvertes par défaut</span></div>
            <div><strong>{primitiveCoverage.testedLive}</strong><span>primitives natives testées sur moteur réel</span></div>
          </div>
          <div className="atlas-engine-chips">
            {Object.entries(primitiveCoverage.nativeFamilies).map(([family, count]) =>
              <span key={family}>{family} · {count}</span>)}
          </div>
          <p>{primitiveCoverage.mockTestedReads} lectures natives testées en simulation · {primitiveCoverage.validatedMutationPlans} plans d’écriture préparés hors ligne · {primitiveCoverage.validatedBinaryPlans} plans de transfert binaire verrouillés. Les fonctions sensibles et les appels natifs restent bloqués. Il faudra valider les contrats, les permissions, la traçabilité et les tests avant de raccorder MAUSBOT.</p>
        </section>
      )}

      {(activeEngine?.status === "not-configured" || activeEngine?.status === "preconnection") && (
        <section className="atlas-engine-panel">
          <h2>Préconnexion MAUSBOT — accès réel verrouillé</h2>
          <p>Les contrats sont disponibles hors connexion. Même avec un serveur configuré, les requêtes MAUSBOT ne sont pas lancées tant que les garde-fous serveur et la revue du jalon M0 ne sont pas validés. Aucun secret n’est saisi dans le navigateur.</p>
        </section>
      )}

      {activeEngine?.status === "configured" && (
        <div className="atlas-engine-workarea">
          <section className="atlas-engine-panel">
            <div className="atlas-engine-section-heading">
              <div><h2>Agents MAUSBOT</h2><p>Inventaire réel provenant du moteur, sans simulation.</p></div>
              <strong>{agents.length} agent{agents.length > 1 ? "s" : ""}</strong>
            </div>
            {agents.length === 0 && <p className="atlas-engine-empty">{loading ? "Lecture du moteur…" : "Aucun agent accessible ou moteur indisponible."}</p>}
            <ul className="atlas-engine-agent-list">
              {agents.map((agent) => <li key={agent.id}><span aria-hidden="true">{agent.emoji ?? "◈"}</span><strong>{agent.name}</strong><small>{agent.id}</small></li>)}
            </ul>
          </section>

          <section className="atlas-engine-panel">
            <h2>Nouvelle mission</h2>
            <p>Créer une tâche MAUSBOT puis transmettre l’instruction. L’approbation reste en mode « demander ».</p>
            <form className="atlas-engine-form" onSubmit={(event) => void submitMission(event)}>
              <label>Agent
                <select required value={botId} onChange={(event) => setBotId(event.target.value)} disabled={!engineOnline || agents.length === 0}>
                  {agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.name}</option>)}
                </select>
              </label>
              <label>Titre de mission
                <input required maxLength={120} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Ex. Audit du projet" />
              </label>
              <label>Instruction
                <textarea required maxLength={4000} rows={5} value={instruction} onChange={(event) => setInstruction(event.target.value)} placeholder="Décrivez le travail que l'agent doit accomplir." />
              </label>
              <button type="submit" disabled={!engineOnline || submitting || !botId || activeWorkspace?.role === "member"}>
                {submitting ? "Transmission…" : "Lancer la mission"}
              </button>
              {activeWorkspace?.role === "member" && <small>Seuls les propriétaires et administrateurs peuvent lancer une mission dans cette première version.</small>}
            </form>
            {dispatch && (
              <div className="atlas-engine-dispatch" role="status">
                <strong>{dispatch.accepted ? "Mission acceptée par MAUSBOT" : dispatch.taskCreated ? "Tâche créée, message non confirmé" : "Mission non transmise"}</strong>
                {dispatch.threadId && <p>Conversation : <code>{dispatch.threadId}</code></p>}
                {dispatch.error && <p>Diagnostic : {dispatch.error}. Vérifier le moteur avant toute nouvelle tentative.</p>}
                {dispatch.accepted && <p>L’envoi a été accepté ; cela ne garantit pas que le travail est terminé.</p>}
                {dispatch.threadId && <button type="button" onClick={() => void inspectJob(dispatch.threadId!)}>Vérifier le job</button>}
                {job && <p>État : {job.state ?? job.status ?? job.phase ?? "non communiqué"}{job.version !== null ? " · version " + job.version : ""}</p>}
                {jobIssue && <p>Job : {jobIssue}</p>}
              </div>
            )}
          </section>
        </div>
      )}
      <p className="atlas-engine-footnote">Étape actuelle : HTTP opérationnel après configuration. MCP, CLI, SSE, installations multiples et pilotage Chief seront intégrés progressivement à ce registre commun.</p>
    </div>
  );
}
