"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "@/components/icon";
import { useAgentContext } from "@/hooks/use-agent-context";
import type { AtlasAgentMessage, AtlasEntity } from "@/lib/agent-gateway/context";
import styles from "./agent-panel.module.css";

const entities: AtlasEntity[] = ["FOUNDER","VELMO","WAHABI","NEW_PLATFORM","PERSO"];
type Settings = {
  pageKey: string; entity: AtlasEntity | "*"; agentId: string;
  isFallback: boolean; updatedAt: string | null;
};
type SettingsReply = {
  settings: Settings; release: { readsEnabled: boolean; mutationsEnabled: false };
};
const errors: Record<string,string> = {
  MAUSBOT_DURABLE_APPROVAL_REQUIRED: "Envoi à MausBot désactivé : l’autorisation durable du module B3 est nécessaire.",
  AGENT_SETTINGS_UNAVAILABLE: "Réglages indisponibles. La migration B1 n’a peut-être pas été appliquée.",
  ENTITY_SCOPE_FORBIDDEN: "Cette entité n’est pas autorisée dans ce workspace.",
  OWNER_REQUIRED: "Seul le propriétaire du workspace peut utiliser cet assistant.",
  MAUSBOT_NOT_CONFIGURED: "MausBot n’est pas configuré pour ce workspace.",
  AGENT_NOT_FOUND_ON_MAUSBOT: "Agent introuvable sur l’instance MausBot autorisée.",
};
function explain(code: string) { return errors[code] ?? "Service agent indisponible (" + code + ")."; }
function readError(value: unknown): string {
  return value && typeof value === "object" && "error" in value && typeof value.error === "string"
    ? value.error : "AGENT_GATEWAY_UNAVAILABLE";
}
export function AgentPanel({ workspaceId,missionId }: { workspaceId: string; missionId: string | null }) {
  const [open,setOpen] = useState(false);
  const [settings,setSettings] = useState<Settings | null>(null);
  const [entity,setEntity] = useState<AtlasEntity | "*">("*");
  const [agentId,setAgentId] = useState("ROGER");
  const [question,setQuestion] = useState("");
  const [error,setError] = useState<string | null>(null);
  const [saving,setSaving] = useState(false);
  const [sending,setSending] = useState(false);
  const [ready,setReady] = useState(false);
  const [threadId,setThreadId] = useState<string | null>(null);
  const [messages,setMessages] = useState<AtlasAgentMessage[]>([]);
  const closeRef = useRef<HTMLButtonElement>(null);
  const context = useAgentContext({workspaceId,pageKey:"missions",entity:settings?.entity ?? "*",objectId:missionId});
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/agent/settings?workspaceId=" + encodeURIComponent(workspaceId) + "&pageKey=missions", {
      credentials:"same-origin",cache:"no-store",signal:controller.signal,
    }).then(async (response) => {
      const data = await response.json() as SettingsReply & { error?: string };
      if (!response.ok) throw new Error(readError(data));
      if (!controller.signal.aborted) {
        setSettings(data.settings);setEntity(data.settings.entity);setAgentId(data.settings.agentId);setReady(true);
      }
    }).catch((reason) => {
      if (!controller.signal.aborted) {setError(explain(reason instanceof Error ? reason.message : "AGENT_SETTINGS_UNAVAILABLE"));setReady(true);}
    });
    return () => controller.abort();
  },[workspaceId]);
  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("keydown",onKeyDown);
    return () => document.removeEventListener("keydown",onKeyDown);
  },[open]);
  const poll = useCallback(async (id: string) => {
    const response = await fetch("/api/agent/thread?workspaceId=" + encodeURIComponent(workspaceId) +
      "&threadId=" + encodeURIComponent(id),{cache:"no-store",credentials:"same-origin"});
    const data = await response.json() as { messages?: AtlasAgentMessage[];error?: string };
    if (!response.ok) throw new Error(readError(data));
    if (Array.isArray(data.messages)) setMessages((list) => {
      const seen = new Set(list.map((message) => message.id));
      return [...list,...data.messages!.filter((message) => !seen.has(message.id))].slice(-60);
    });
  },[workspaceId]);
  useEffect(() => {
    if (!threadId || !open) return;
    const immediate = setTimeout(() => {
      void poll(threadId).catch((e) => setError(explain(e instanceof Error ? e.message : "AGENT_GATEWAY_UNAVAILABLE")));
    }, 0);
    const handle = setInterval(() => {
      void poll(threadId).catch((e) => setError(explain(e instanceof Error ? e.message : "AGENT_GATEWAY_UNAVAILABLE")));
    },5000);
    return () => { clearTimeout(immediate);clearInterval(handle); };
  },[open,threadId,poll]);
  const save = async () => {
    if (saving) return;
    setSaving(true);setError(null);
    try {
      const response = await fetch("/api/agent/settings",{method:"PUT",credentials:"same-origin",cache:"no-store",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({workspaceId,pageKey:"missions",entity,agentId})});
      const data = await response.json() as {settings?: Settings;error?: string};
      if (!response.ok || !data.settings) throw new Error(readError(data));
      setSettings(data.settings);setThreadId(null);setMessages([]);
    } catch (reason) {setError(explain(reason instanceof Error ? reason.message : "AGENT_GATEWAY_UNAVAILABLE"));}
    finally {setSaving(false);}
  };
  const send = async () => {
    if (sending || !settings || settings.entity === "*" || !question.trim()) return;
    setSending(true);setError(null);
    try {
      const response = await fetch("/api/agent/ask",{method:"POST",credentials:"same-origin",cache:"no-store",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({pageKey:"missions",context,question:question.trim(),sendId:crypto.randomUUID()})});
      const data = await response.json() as {threadId?:string;accepted?:boolean;error?:string};
      if (!response.ok || !data.accepted || !data.threadId) throw new Error(data.error ?? "AGENT_GATEWAY_UNAVAILABLE");
      setQuestion("");setThreadId(data.threadId);
    } catch (reason) { setError(explain(reason instanceof Error ? reason.message : "AGENT_GATEWAY_UNAVAILABLE")); }
    finally {setSending(false);}
  };
  const dirty = !settings || entity !== settings.entity || agentId !== settings.agentId || settings.isFallback;
  return <>
    <button type="button" className={styles.launcher} onClick={() => setOpen(true)}
      aria-label="Ouvrir l’assistant MausBot" aria-expanded={open} aria-controls="atlas-agent-panel">
      <Icon name="bot" /> Assistant ATLAS
    </button>
    {open && <div className={styles.backdrop} onClick={() => setOpen(false)} aria-hidden="true" />}
    <aside id="atlas-agent-panel" role="dialog" aria-modal="true" aria-label="Assistant MausBot — Missions"
      className={styles.panel + (open ? " " + styles.open : "")} inert={!open}>
      <header className={styles.header}>
        <div><strong><Icon name="bot" /> Assistant · Missions</strong><small>Échanges réels uniquement · accès propriétaire</small></div>
        <button type="button" ref={closeRef} onClick={() => setOpen(false)} aria-label="Fermer l’assistant"><Icon name="close" /></button>
      </header>
      <section className={styles.config} aria-label="Préférences de l’assistant">
        <label>Entité de ce workspace
          <select value={entity} onChange={(event) => setEntity(event.target.value as AtlasEntity | "*")}>
            <option value="*">Non reliée — choisir une entité</option>
            {entities.map((item) => <option value={item} key={item}>{item}</option>)}
          </select>
        </label>
        <label>Agent par défaut sur Missions
          <input value={agentId} onChange={(event) => setAgentId(event.target.value)} maxLength={120}
            autoComplete="off" spellCheck={false} placeholder="Identifiant MausBot" />
        </label>
        <button type="button" onClick={() => void save()} disabled={!ready || saving || !dirty || entity === "*" || !/^[A-Za-z0-9_-]{1,120}$/.test(agentId)}>
          {saving ? "Enregistrement…" : "Enregistrer les préférences"}
        </button>
        {settings?.isFallback && <p>Aucun réglage de cette page n’est encore enregistré. Valeur héritée du défaut global.</p>}
      </section>
      <section className={styles.transcript} aria-label="Messages réels MausBot" aria-live="polite">
        {messages.length ? messages.map((message) => <article key={message.id} className={styles.message}>
          <small>{message.role}</small><p>{message.text}</p>
        </article>) : <p className={styles.empty}>Aucun message réel reçu pour cette page.</p>}
      </section>
      <div className={styles.composer}>
        {error && <p className={styles.error} role="alert">{error}</p>}
        <p className={styles.guard}>Envoi bloqué par la politique MausBot actuelle. Aucun message ni réponse simulés.</p>
        <form onSubmit={(event) => {event.preventDefault();void send();}}>
          <label className={styles.srOnly} htmlFor="atlas-agent-question">Votre question</label>
          <textarea id="atlas-agent-question" rows={2} maxLength={2000} value={question}
            onChange={(event) => setQuestion(event.target.value)} placeholder="Votre question à MausBot…" />
          <button type="submit" disabled={!settings || settings.entity === "*" || sending || !question.trim() || dirty}>
            {sending ? "Vérification…" : "Demander"}
          </button>
        </form>
      </div>
    </aside>
  </>;
}
