"use client";
import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { listWorkspaces } from "@/app/workspaces/actions";
import type { WorkspaceResult } from "@/lib/workspaces/contract";
type Option = { id: string; label?: string; title?: string };
type Receipt = { run_id: string; intent_digest: string; decision: string; expires_at: string };

export function AgentRequestForm() {
  const [spaces, setSpaces] = useState<WorkspaceResult | { status: "loading" }>({ status: "loading" });
  const [workspaceId, setWorkspace] = useState("");
  const [instances, setInstances] = useState<Option[]>([]), [missions, setMissions] = useState<Option[]>([]);
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
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || loading || receipt || !instanceId || !missionId) return;
    const form = new FormData(event.currentTarget);
    const snapshot = generation.current;
    requestId.current ??= crypto.randomUUID();
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/engines/agent-requests", {
        method: "POST", credentials: "same-origin", cache: "no-store", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId, instanceId, missionId, requestId: requestId.current,
          name: form.get("name"), title: form.get("title"), description: form.get("description") }),
      });
      const data = await response.json();
      if (!response.ok || data.canDispatch !== false || !data.request?.run_id) throw Error("REQUEST_UNAVAILABLE");
      if (snapshot === generation.current) setReceipt(data.request);
    } catch { if (snapshot === generation.current) setError("Demande non confirmée. Réessayez sans modifier le formulaire pour conserver la même référence."); }
    finally { if (snapshot === generation.current) setBusy(false); }
  }
  return <section className="agent-request-panel" aria-labelledby="agent-request-heading">
    <h2 id="agent-request-heading">Préparer un agent</h2>
    <p>Définissez son profil et demandez une revue humaine. L’agent ne sera pas créé dans MAUSBOT à cette étape.</p>
    {spaces.status === "ready" ? <>
      <label htmlFor="agent-workspace">Workspace</label>
      <select id="agent-workspace" value={workspaceId} disabled={busy} onChange={event => { generation.current++; setReceipt(null); setInstances([]); setMissions([]); setLoading(true); setWorkspace(event.target.value); }}>
        {spaces.workspaces.map(space => <option key={space.id} value={space.id}>{space.name}</option>)}
      </select>
      {loading ? <p role="status">Chargement…</p> : !instances.length || !missions.length ?
        <p>Une instance MAUSBOT hors ligne et une mission planifiée ou active sont nécessaires. <Link href="/missions">Ouvrir les missions</Link> · <Link href="/engines">Ouvrir les moteurs</Link></p> :
        <form ref={formRef} onSubmit={event => void submit(event)} onChange={() => { if (!busy && !receipt) requestId.current = null; }}>
          <fieldset disabled={busy || !!receipt}>
            <legend>Profil proposé</legend>
            <label htmlFor="agent-instance">Instance hors ligne</label>
            <select id="agent-instance" value={instanceId} onChange={event => setInstance(event.target.value)}>{instances.map(instance => <option key={instance.id} value={instance.id}>{instance.label}</option>)}</select>
            <label htmlFor="agent-mission">Mission ATLAS</label>
            <select id="agent-mission" value={missionId} onChange={event => setMission(event.target.value)}>{missions.map(mission => <option key={mission.id} value={mission.id}>{mission.title}</option>)}</select>
            <label htmlFor="agent-name">Nom</label><input id="agent-name" name="name" required maxLength={100} />
            <label htmlFor="agent-title">Rôle</label><input id="agent-title" name="title" maxLength={200} />
            <label htmlFor="agent-description">Description du rôle — sans identifiant ni secret</label><textarea id="agent-description" name="description" maxLength={1000} rows={4} />
            <button type="submit">{busy ? "Enregistrement…" : "Demander la revue du profil"}</button>
          </fieldset>
        </form>}
      {receipt ? <div role="status"><p>Demande enregistrée : {receipt.decision === "pending" ? "en attente de revue" : receipt.decision}. Aucun agent créé dans MAUSBOT.</p>
        <p>Référence : <code>{receipt.run_id}</code></p><Link href="/engines/approvals">Ouvrir les demandes à valider</Link>
        <button type="button" onClick={() => { formRef.current?.reset(); requestId.current = null; setReceipt(null); setError(""); }}>Préparer un autre profil</button></div> : null}
      {error ? <p role="alert">{error}</p> : null}
    </> : <p role="status">Connectez-vous à un workspace pour préparer un agent.</p>}
  </section>;
}
