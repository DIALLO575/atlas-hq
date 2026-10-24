"use client";

import { useEffect, useState } from "react";
import { listWorkspaces } from "@/app/workspaces/actions";
import type { WorkspaceResult } from "@/lib/workspaces/contract";

type Pending = {
  run_id: string;
  instance_id: string;
  mission_id: string;
  primitive_id: string;
  intent_digest: string;
  requested_at: string;
  expires_at: string;
};

export function ApprovalInbox() {
  const [workspaceState, setWorkspaceState] = useState<WorkspaceResult | {status:"loading"}>({status:"loading"});
  const [selected, setSelected] = useState("");
  const [items, setItems] = useState<Pending[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    void listWorkspaces().then(result => {
      if (!active) return;
      setWorkspaceState(result);
      if (result.status === "ready") setSelected(result.selectedId);
    }).catch(() => {
      if (active) setWorkspaceState({status:"error",message:"WORKSPACES_UNAVAILABLE"});
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!selected) return;
    const controller = new AbortController();
    void Promise.resolve().then(async () => {
      if (controller.signal.aborted) return;
      setItems([]);
      setError("");
      setBusy(true);
      try {
        const response = await fetch("/api/engines/approvals?workspaceId="+encodeURIComponent(selected), {
          method:"GET", credentials:"same-origin", cache:"no-store", signal:controller.signal,
        });
        const payload = await response.json() as {approvals?:Pending[];error?:string};
        if (!response.ok) throw new Error(payload.error || "INBOX_UNAVAILABLE");
        if (!controller.signal.aborted) setItems(Array.isArray(payload.approvals)?payload.approvals:[]);
      } catch (e) {
        if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "INBOX_UNAVAILABLE");
      } finally { if (!controller.signal.aborted) setBusy(false); }
    });
    return () => controller.abort();
  }, [selected]);

  return <section aria-labelledby="approval-inbox-title">
    <h2 id="approval-inbox-title">Demandes en attente</h2>
    <p>Lecture seule. L&apos;approbation et l&apos;exécution des missions restent désactivées.</p>
    {workspaceState.status === "ready" ? <>
      <label htmlFor="approval-workspace">Workspace</label>
      <select id="approval-workspace" value={selected} onChange={event => setSelected(event.target.value)}>
        {workspaceState.workspaces.map(ws => <option key={ws.id} value={ws.id}>{ws.name}</option>)}
      </select>
      {busy ? <p role="status">Chargement des demandes…</p>
        : error ? <p role="alert">{error}</p>
        : items.length === 0 ? <p>Aucune demande visible pour ce workspace.</p>
        : <ul>{items.map(item=><li key={item.run_id}>
          <strong>{item.primitive_id}</strong>
          <p>Mission : <code>{item.mission_id}</code></p>
          <p>Empreinte : <code>{item.intent_digest.slice(0,16)}…</code></p>
          <p>Expire : <time dateTime={item.expires_at}>{item.expires_at}</time></p>
        </li>)}</ul>}
    </> : <p role="status">Workspaces non disponibles ou chargement en cours.</p>}
  </section>;
}
