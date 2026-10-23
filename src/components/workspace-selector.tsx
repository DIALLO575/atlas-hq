"use client";

import { useEffect, useState } from "react";
import { listWorkspaces, selectWorkspace as updateSelectedWorkspace } from "@/app/workspaces/actions";
import type { WorkspaceResult } from "@/lib/workspaces/contract";

export function WorkspaceSelector() {
  const [result, setResult] = useState<WorkspaceResult | { status: "loading" }>({ status: "loading" });

  useEffect(() => {
    let alive = true;
    void listWorkspaces().then((value) => {
      if (alive) setResult(value);
    }).catch(() => {
      if (alive) setResult({ status: "error", message: "Impossible de charger les workspaces." });
    });
    return () => { alive = false; };
  }, []);

  if (result.status === "loading") {
    return <div className="workspace-switch workspace-switch-disabled" role="status" aria-busy="true">Chargement des workspaces…</div>;
  }

  if (result.status === "error") {
    return <div className="workspace-switch workspace-switch-disabled" role="alert">{result.message}</div>;
  }

  if (result.workspaces.length === 0) {
    return <div className="workspace-switch workspace-switch-disabled" role="status">Aucun workspace attribué</div>;
  }

  const selectedWorkspace = result.workspaces.find((workspace) => workspace.id === result.selectedId) ?? result.workspaces[0];
  const selectWorkspace = async (workspaceId: string) => {
    try {
      setResult(await updateSelectedWorkspace(workspaceId));
    } catch {
      setResult({ status: "error", message: "Impossible de changer de workspace." });
    }
  };

  return <label className="workspace-switch workspace-switch-ready">
    <span className="sr-only">Workspace actif</span>
    <span className="workspace-avatar" aria-hidden="true">{selectedWorkspace.name.slice(0, 1)}</span>
    <select aria-label="Workspace actif" value={selectedWorkspace.id} disabled={result.workspaces.length < 2} onChange={(event) => void selectWorkspace(event.target.value)}>
      {result.workspaces.map((workspace) => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}
    </select>
    <span className="switch-chevron" aria-hidden="true">⌄</span>
  </label>;
}
