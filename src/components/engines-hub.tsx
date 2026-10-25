"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Icon } from "@/components/icon";
import { listWorkspaces } from "@/app/workspaces/actions";
import type { WorkspaceResult } from "@/lib/workspaces/contract";

type Engine = {
  id: string;
  name: string;
  description: string;
  status: "planned" | "configured" | "preconnection" | "not-configured";
};
type WorkspaceState = WorkspaceResult | { status: "loading" };

const logos: Record<string, string> = {
  mausbot: "/brands/mausbot.svg",
  n8n: "/brands/n8n.svg",
  hermes: "/brands/hermes-agent.svg",
};

function EngineStatus({ engine, online }: { engine: Engine; online: boolean }) {
  const state = engine.id === "mausbot" && online ? "online" : engine.status;
  const label = state === "online" ? "En ligne"
    : state === "configured" ? "À vérifier"
    : state === "preconnection" ? "En préparation"
    : state === "planned" ? "À venir" : "Non connecté";
  return <span className="atlas-engine-status" data-state={state}>
    <span className="atlas-engine-status-dot" aria-hidden="true" />{label}
  </span>;
}

export function EnginesHub() {
  const [spaces, setSpaces] = useState<WorkspaceState>({ status: "loading" });
  const [workspaceId, setWorkspaceId] = useState("");
  const [engines, setEngines] = useState<Engine[]>([]);
  const [online, setOnline] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let active = true;
    void listWorkspaces().then(result => {
      if (!active) return;
      setSpaces(result);
      if (result.status === "ready") setWorkspaceId(result.selectedId);
    }).catch(() => {
      if (active) setSpaces({ status: "error", message: "WORKSPACES_UNAVAILABLE" });
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!workspaceId) return;
    const controller = new AbortController();
    const load = async () => {
      setLoading(true);
      setError("");
      setOnline(false);
      setEngines([]);
      try {
        const response = await fetch("/api/engines?workspaceId=" + encodeURIComponent(workspaceId), {
          cache: "no-store", credentials: "same-origin", signal: controller.signal,
        });
        const data = await response.json();
        if (!response.ok || !Array.isArray(data.engines)) throw Error("ENGINE_CATALOG_UNAVAILABLE");
        if (controller.signal.aborted) return;
        const catalog = data.engines.filter((item: unknown): item is Engine => {
          if (!item || typeof item !== "object" || Array.isArray(item)) return false;
          const value = item as Record<string, unknown>;
          return typeof value.id === "string" && typeof value.name === "string" &&
            typeof value.description === "string" &&
            ["planned", "configured", "preconnection", "not-configured"].includes(String(value.status));
        });
        setEngines(catalog);
        if (!catalog.some((engine: Engine) => engine.id === "mausbot" && engine.status === "configured")) return;
        // The catalogue status is configuration-only; show "online" only after a real health check.
        try {
          const health = await fetch("/api/engines/mausbot?workspaceId=" +
            encodeURIComponent(workspaceId) + "&view=health", {
              cache: "no-store", credentials: "same-origin", signal: controller.signal,
            });
          const identity = health.ok ? await health.json() : null;
          if (!controller.signal.aborted) setOnline(identity?.app === "openmausbot" || identity?.connected === true);
        } catch {
          if (!controller.signal.aborted) setOnline(false);
        }
      } catch {
        if (!controller.signal.aborted) setError("Impossible de charger les moteurs pour ce workspace.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    void load();
    return () => controller.abort();
  }, [workspaceId, revision]);

  return (
    <section className="atlas-engine-hub" aria-label="Catalogue des moteurs IA">
      <div className="atlas-engine-toolbar">
        <div className="atlas-engine-toolbar-intro">
          <span className="atlas-engine-toolbar-icon"><Icon name="layers" /></span>
          <strong>Vos moteurs</strong>
        </div>
        <div className="atlas-engine-toolbar-actions">
          {spaces.status === "ready" && <label>
            <span>Workspace</span>
            <select value={workspaceId} onChange={event => setWorkspaceId(event.target.value)}>
              {spaces.workspaces.map(space =>
                <option key={space.id} value={space.id}>{space.name}</option>)}
            </select>
          </label>}
          <button type="button" disabled={!workspaceId || loading}
            onClick={() => setRevision(value => value + 1)} aria-label="Actualiser la liste des moteurs">
            <Icon name="rotate-ccw" /> <span>{loading ? "Chargement…" : "Actualiser"}</span>
          </button>
        </div>
      </div>

      {spaces.status === "loading" && <p className="atlas-engine-state" role="status">Chargement des workspaces…</p>}
      {spaces.status === "error" && <p className="atlas-engine-state" role="alert">Workspaces indisponibles.</p>}
      {spaces.status === "ready" && !spaces.workspaces.length && <p className="atlas-engine-state" role="status">Aucun workspace accessible.</p>}
      {error && <p className="atlas-engine-state atlas-engine-state-error" role="alert">{error}</p>}
      {loading && !engines.length && <p className="atlas-engine-state" role="status">Chargement des moteurs…</p>}

      {engines.length > 0 && <div className="atlas-engine-grid" aria-label="Moteurs disponibles">
        {engines.map(engine => <article key={engine.id}
          className={"atlas-engine-card atlas-engine-card-" + (engine.id === "mausbot" ? "mausbot" : engine.id === "hermes" ? "hermes" : "generic")}>
          <div className="atlas-engine-card-top">
            <span className="atlas-engine-symbol" aria-hidden="true">
              {logos[engine.id] ? <Image src={logos[engine.id]} width={66} height={66} alt="" unoptimized />
                : <Icon name="bot" />}
            </span>
            <EngineStatus engine={engine} online={online} />
          </div>
          <div className="atlas-engine-card-body">
            <h2>{engine.name}</h2>
            <p>{engine.description}</p>
          </div>
          <div className="atlas-engine-card-footer">
            {engine.id === "mausbot" ? (
              <Link href="/agents" className="atlas-engine-card-action">Ouvrir les agents <Icon name="arrow-up-right" /></Link>
            ) : engine.id === "n8n" ? (
              <Link href="/apps/n8n" className="atlas-engine-card-action">Ouvrir n8n <Icon name="arrow-up-right" /></Link>
            ) : engine.id === "hermes" ? (
              <a href="https://hermes-agent.nousresearch.com/docs" target="_blank" rel="noopener noreferrer"
                className="atlas-engine-card-action">Découvrir Hermes <Icon name="arrow-up-right" /></a>
            ) : (
              <span className="atlas-engine-card-action-muted">Moteur du catalogue</span>
            )}
          </div>
        </article>)}
      </div>}
    </section>
  );
}
