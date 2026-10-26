"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Icon } from "@/components/icon";
import { useAgentContext } from "@/hooks/use-agent-context";
import { createAgentPollScheduler } from "@/lib/agent-gateway/poll-scheduler.mjs";
import type { AtlasAgentMessage, AtlasEntity } from "@/lib/agent-gateway/context";
import styles from "./agent-panel.module.css";

const entities: AtlasEntity[] = ["FOUNDER","VELMO","WAHABI","NEW_PLATFORM","PERSO"];
type Settings = {pageKey:string;entity:AtlasEntity|"*";agentId:string;isFallback:boolean;updatedAt:string|null};
type SettingsReply = {settings:Settings; release:{readsEnabled:boolean;mutationsEnabled:false}};
type ThreadReply = {threadId:string|null;messages:AtlasAgentMessage[];pending:boolean;error?:string};
const errors:Record<string,string> = {
  MAUSBOT_DURABLE_APPROVAL_REQUIRED:"Interruption et envoi bloqués : autorisation B3 nécessaire.",
  AGENT_SETTINGS_UNAVAILABLE:"Réglages indisponibles. Réessayez ultérieurement.",
  AGENT_THREAD_UNAVAILABLE:"Historique indisponible pour ce workspace.",
  THREAD_AGENT_CHANGED:"Ce fil appartient à un autre agent. Ancien historique non affiché.",
  MAUSBOT_PRECONNECTION_GATE_CLOSED:"Lecture MausBot non autorisée pour cet espace.",
  ENTITY_SCOPE_FORBIDDEN:"Cette entité n’est pas autorisée dans ce workspace.",
  OWNER_REQUIRED:"Seul le propriétaire du workspace peut utiliser cet assistant.",
  MAUSBOT_NOT_CONFIGURED:"MausBot n’est pas configuré pour ce workspace.",
  AGENT_NOT_FOUND_ON_MAUSBOT:"L’agent enregistré est introuvable sur MausBot.",
};
const explain=(code:string)=>errors[code]??"Service agent indisponible ("+code+").";
const readError=(value:unknown):string=>
  value&&typeof value==="object"&&"error" in value&&typeof value.error==="string"
    ?value.error:"AGENT_GATEWAY_UNAVAILABLE";
const isAgentResponse=(message:AtlasAgentMessage)=>["assistant","agent","bot"].includes(message.role.toLowerCase());
const SHORTCUTS=[
  {name:"Explique",template:"Explique clairement le contexte et les enjeux de "},
  {name:"Résume",template:"Résume les points essentiels de "},
  {name:"Fais une fiche",template:"Fais une fiche synthétique structurée sur "},
] as const;

export function AgentPanel({workspaceId,missionId}:{workspaceId:string;missionId:string|null}) {
  const [open,setOpen]=useState(false);
  const [settings,setSettings]=useState<Settings|null>(null);
  const [release,setRelease]=useState<SettingsReply["release"]|null>(null);
  const [entity,setEntity]=useState<AtlasEntity|"*">("*");
  const [agentId,setAgentId]=useState("ROGER");
  const [question,setQuestion]=useState("");
  const [error,setError]=useState<string|null>(null);
  const [saving,setSaving]=useState(false);
  const [sending,setSending]=useState(false);
  const [interrupting,setInterrupting]=useState(false);
  const [ready,setReady]=useState(false);
  const [loadingThread,setLoadingThread]=useState(false);
  const [threadId,setThreadId]=useState<string|null>(null);
  const [messages,setMessages]=useState<AtlasAgentMessage[]>([]);
  const [awaiting,setAwaiting]=useState(false);
  const [paintLatency,setPaintLatency]=useState<number|null>(null);
  const pollSchedulerRef=useRef<ReturnType<typeof createAgentPollScheduler>|null>(null);
  const closeRef=useRef<HTMLButtonElement>(null);
  const launcherRef=useRef<HTMLButtonElement>(null);
  const textareaRef=useRef<HTMLTextAreaElement>(null);
  const transcriptRef=useRef<HTMLElement>(null);
  const threadIdRef=useRef<string|null>(null);
  const lastIdRef=useRef<string|null>(null);
  const turnStartedRef=useRef<number|null>(null);
  const lastBatchReceivedAt=useRef<number|null>(null);
  const lastMeasuredMessageId=useRef<string|null>(null);
  const context=useAgentContext({workspaceId,pageKey:"missions",entity:settings?.entity??"*",objectId:missionId});
  const dirty=!settings||entity!==settings.entity||agentId!==settings.agentId||settings.isFallback;
  const writeLocked=release?.mutationsEnabled===false||release===null;

  useEffect(()=>{
    const controller=new AbortController();
    fetch("/api/agent/settings?workspaceId="+encodeURIComponent(workspaceId)+"&pageKey=missions",{
      credentials:"same-origin",cache:"no-store",signal:controller.signal,
    }).then(async response=>{
      const data=await response.json() as SettingsReply&{error?:string};
      if(!response.ok)throw new Error(readError(data));
      if(!controller.signal.aborted){
        setSettings(data.settings);setEntity(data.settings.entity);
        setAgentId(data.settings.agentId);setRelease(data.release);setReady(true);
      }
    }).catch(reason=>{
      if(!controller.signal.aborted){
        setError(explain(reason instanceof Error?reason.message:"AGENT_SETTINGS_UNAVAILABLE"));setReady(true);
      }
    });
    return ()=>controller.abort();
  },[workspaceId]);

  useEffect(()=>{
    if(!open)return;
    closeRef.current?.focus();
    const keydown=(event:KeyboardEvent)=>{
      if(event.key==="Escape"){setOpen(false);launcherRef.current?.focus();return;}
      if(event.key!=="Tab")return;
      const focusables=Array.from(document.querySelectorAll<HTMLElement>(
        "#atlas-agent-panel button:not(:disabled), #atlas-agent-panel input:not(:disabled), #atlas-agent-panel select:not(:disabled), #atlas-agent-panel textarea:not(:disabled)"
      )).filter(el=>el.getClientRects().length>0);
      const first=focusables[0],last=focusables[focusables.length-1];
      if(!first||!last)return;
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
    };
    document.addEventListener("keydown",keydown);
    return ()=>document.removeEventListener("keydown",keydown);
  },[open]);

  // Only a real message supplied by the backend can trigger the bubble and
  // first-paint latency sample. Never render optimistic/fabricated replies.
  useLayoutEffect(()=>{
    const receivedAt=lastBatchReceivedAt.current;
    const latest=messages.at(-1)?.id??null;
    if(receivedAt===null||!latest||latest===lastMeasuredMessageId.current)return;
    lastMeasuredMessageId.current=latest;
    lastBatchReceivedAt.current=null;
    const frame=requestAnimationFrame(()=>{
      setPaintLatency(Math.max(0,Math.round(performance.now()-receivedAt)));
      const node=transcriptRef.current;
      if(node)node.scrollTop=node.scrollHeight;
    });
    return ()=>cancelAnimationFrame(frame);
  },[messages]);

  useEffect(()=>{
    if(!open||!ready||!settings||settings.entity==="*"||dirty)return;
    const scheduler=createAgentPollScheduler({
      isActive:()=>turnStartedRef.current!==null&&Date.now()-turnStartedRef.current<90_000,
      load:async signal=>{
        const activeId=threadIdRef.current;
        const qs=new URLSearchParams({workspaceId});
        if(activeId){
          qs.set("threadId",activeId);
          if(lastIdRef.current)qs.set("afterId",lastIdRef.current);
        }else{
          qs.set("pageKey","missions");
          if(missionId)qs.set("objectId",missionId);
        }
        const response=await fetch("/api/agent/thread?"+qs.toString(),{
          credentials:"same-origin",cache:"no-store",signal,
        });
        const data=await response.json() as ThreadReply;
        if(signal.aborted||document.visibilityState==="hidden")return;
        if(!response.ok)throw new Error(readError(data));
        setLoadingThread(false);
        if(data.threadId&&data.threadId!==threadIdRef.current){
          threadIdRef.current=data.threadId;
          setThreadId(data.threadId);
        }
        const receivedAt=performance.now();
        if(Array.isArray(data.messages)&&data.messages.length){
          const incoming=data.messages.filter(item=>
            item&&typeof item.id==="string"&&typeof item.text==="string");
          if(incoming.length){
            lastIdRef.current=incoming.at(-1)!.id;
            setMessages(current=>{
              const known=new Set(current.map(item=>item.id));
              const fresh=incoming.filter(item=>!known.has(item.id));
              if(!fresh.length)return current;
              lastBatchReceivedAt.current=receivedAt;
              return [...current,...fresh].slice(-80);
            });
            if(turnStartedRef.current!==null&&incoming.some(isAgentResponse)){
              turnStartedRef.current=null;setAwaiting(false);
            }
          }
        }
        if(turnStartedRef.current!==null&&Date.now()-turnStartedRef.current>=90_000){
          turnStartedRef.current=null;setAwaiting(false);
        }
      },
      onError:reason=>{
        setLoadingThread(false);
        setError(explain(reason instanceof Error?reason.message:"AGENT_THREAD_UNAVAILABLE"));
      },
    });
    const begin=setTimeout(()=>setLoadingThread(true),0);
    pollSchedulerRef.current=scheduler;
    scheduler.start();
    return ()=>{clearTimeout(begin);scheduler.stop();if(pollSchedulerRef.current===scheduler)pollSchedulerRef.current=null;};
  },[open,ready,settings,dirty,workspaceId,missionId]);

  const save=async()=>{
    if(saving)return;
    setSaving(true);setError(null);
    try{
      const response=await fetch("/api/agent/settings",{
        method:"PUT",credentials:"same-origin",cache:"no-store",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({workspaceId,pageKey:"missions",entity,agentId}),
      });
      const data=await response.json() as {settings?:Settings;error?:string};
      if(!response.ok||!data.settings)throw new Error(readError(data));
      threadIdRef.current=null;lastIdRef.current=null;turnStartedRef.current=null;
      setSettings(data.settings);setThreadId(null);setMessages([]);setAwaiting(false);setPaintLatency(null);
    }catch(reason){setError(explain(reason instanceof Error?reason.message:"AGENT_GATEWAY_UNAVAILABLE"));}
    finally{setSaving(false);}
  };
  const send=async()=>{
    if(sending||!settings||settings.entity==="*"||dirty||!question.trim()||writeLocked){
      if(writeLocked)setError(explain("MAUSBOT_DURABLE_APPROVAL_REQUIRED"));
      return;
    }
    setSending(true);setError(null);
    try{
      const response=await fetch("/api/agent/ask",{
        method:"POST",credentials:"same-origin",cache:"no-store",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({pageKey:"missions",context,question:question.trim(),sendId:crypto.randomUUID()}),
      });
      const data=await response.json() as {threadId?:string;accepted?:boolean;error?:string};
      if(!response.ok||!data.accepted||!data.threadId)
        throw new Error(data.error??"AGENT_GATEWAY_UNAVAILABLE");
      threadIdRef.current=data.threadId;setThreadId(data.threadId);
      turnStartedRef.current=Date.now();setAwaiting(true);setQuestion("");
      pollSchedulerRef.current?.refresh();
    }catch(reason){setError(explain(reason instanceof Error?reason.message:"AGENT_GATEWAY_UNAVAILABLE"));}
    finally{setSending(false);}
  };
  const interrupt=async()=>{
    if(!awaiting||!threadId||interrupting)return;
    setInterrupting(true);setError(null);
    try{
      const response=await fetch("/api/agent/interrupt",{
        method:"POST",credentials:"same-origin",cache:"no-store",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({workspaceId,threadId}),
      });
      const data=await response.json() as {error?:string};
      if(!response.ok)throw new Error(readError(data));
    }catch(reason){
      // Keep awaiting: 423 means the real remote turn was NOT interrupted.
      setError(explain(reason instanceof Error?reason.message:"MAUSBOT_DURABLE_APPROVAL_REQUIRED"));
    }finally{setInterrupting(false);}
  };
  const prefill=(index:number)=>{
    const shortcut=SHORTCUTS[index];
    if(!shortcut)return;
    const target=missionId?"la mission sélectionnée.":"la page Missions.";
    setQuestion(shortcut.template+target);
    textareaRef.current?.focus();
  };
  const dismiss=()=>{setOpen(false);launcherRef.current?.focus();};
  const unread=messages.length;
  return <>
    <button type="button" ref={launcherRef} className={styles.launcher}
      onClick={()=>setOpen(true)} aria-label="Ouvrir l’assistant MausBot"
      aria-expanded={open} aria-controls="atlas-agent-panel">
      <span className={styles.launcherIcon}><Icon name="spark"/></span>
      <span>Assistant ATLAS</span>
      {unread>0&&<span className={styles.messageCount} aria-label={unread+" messages réels"}>{unread}</span>}
    </button>
    {open&&<div className={styles.backdrop} onClick={dismiss} aria-hidden="true"/>}
    <aside id="atlas-agent-panel" role="dialog" aria-modal="true"
      aria-label="Assistant MausBot — Missions"
      className={styles.panel+(open?" "+styles.open:"")} inert={!open}>
      <header className={styles.header}>
        <span className={styles.avatar}><Icon name="bot"/></span>
        <div className={styles.title}><strong>Assistant Missions</strong>
          <small>ATLAS × MausBot · fil réel</small></div>
        <span className={styles.readOnly}>Lecture seule</span>
        <button type="button" ref={closeRef} className={styles.close}
          onClick={dismiss} aria-label="Fermer l’assistant"><Icon name="close"/></button>
      </header>
      <div className={styles.contextStrip}>
        <Icon name="layers"/>
        <span>{missionId?"Mission sélectionnée":"Page Missions"}</span>
        <span className={styles.contextDot}>·</span>
        <strong>{settings?.agentId??"Agent à régler"}</strong>
      </div>
      <details className={styles.preferences}>
        <summary><Icon name="settings"/> Préférences de l’agent <Icon name="chevron-right"/></summary>
        <div className={styles.config} aria-label="Préférences de l’assistant">
          <label>Entité de ce workspace
            <select value={entity} onChange={event=>setEntity(event.target.value as AtlasEntity|"*")}>
              <option value="*">Non reliée — choisir une entité</option>
              {entities.map(item=><option value={item} key={item}>{item}</option>)}
            </select>
          </label>
          <label>Agent par défaut sur Missions
            <input value={agentId} onChange={event=>setAgentId(event.target.value)}
              maxLength={120} autoComplete="off" spellCheck={false} placeholder="Identifiant MausBot"/>
          </label>
          <button type="button" onClick={()=>void save()}
            disabled={!ready||saving||!dirty||entity==="*"||!/^[A-Za-z0-9_-]{1,120}$/.test(agentId)}>
            {saving?"Enregistrement…":"Enregistrer les préférences"}
          </button>
          {settings?.isFallback&&<p>Valeur héritée du défaut global, pas encore enregistrée pour cette page.</p>}
        </div>
      </details>
      <section ref={transcriptRef} className={styles.transcript}
        aria-label="Messages réels MausBot" aria-live="polite" aria-relevant="additions">
        <div className={styles.threadIntro}>
          <span className={styles.threadIcon}><Icon name="spark"/></span>
          <h2>Votre fil de mission</h2>
          <p>Historique lié à {missionId?"cette mission":"cette page"}, visible seulement
            dans votre workspace. Les réponses proviennent exclusivement de MausBot.</p>
        </div>
        {!messages.length&&<p className={styles.empty}>Aucun message réel reçu pour cette page.</p>}
        {messages.map(message=><article key={message.id}
          className={styles.message+" "+(message.role==="user"?styles.userMessage:styles.agentMessage)}>
          <span className={styles.bubbleAuthor}>{message.role==="user"?"Vous":message.role}</span>
          <p>{message.text}</p>
          {message.at&&<time dateTime={message.at}>{new Date(message.at).toLocaleTimeString("fr",{hour:"2-digit",minute:"2-digit"})}</time>}
        </article>)}
        {awaiting&&<div className={styles.typing} role="status"
          aria-label="En attente de la réponse de MausBot">
          <span className={styles.dots} aria-hidden="true"><i/><i/><i/></span>
          <span>En attente d’une réponse réelle…</span>
        </div>}
        {loadingThread&&<p className={styles.loading} role="status">Lecture de l’historique…</p>}
      </section>
      <div className={styles.composer}>
        {error&&<p className={styles.error} role="alert">{error}</p>}
        <div className={styles.shortcutRow} aria-label="Raccourcis de rédaction">
          {SHORTCUTS.map((shortcut,index)=><button type="button"
            key={shortcut.name} onClick={()=>prefill(index)}>{shortcut.name}</button>)}
        </div>
        <form onSubmit={event=>{event.preventDefault();void send();}}>
          <label className={styles.srOnly} htmlFor="atlas-agent-question">Votre question</label>
          <textarea id="atlas-agent-question" ref={textareaRef} rows={2} maxLength={2000}
            value={question} onChange={event=>setQuestion(event.target.value)}
            placeholder="Préparez une question à MausBot…"/>
          <div className={styles.actionRow}>
            <button type="button" className={styles.interrupt}
              onClick={()=>void interrupt()} disabled={!awaiting||!threadId||interrupting}
              title="Interruption bloquée par B3">
              <Icon name="close"/> Interrompre
            </button>
            <button type="submit" className={styles.send}
              disabled={!settings||settings.entity==="*"||sending||!question.trim()||dirty||writeLocked}>
              {sending?"Envoi…":"Demander"} <Icon name="arrow-up"/>
            </button>
          </div>
        </form>
        <p className={styles.guard}><Icon name="shield-check"/>
          Envoi et interruption verrouillés jusqu’à B3. Aucun message simulé.</p>
        {paintLatency!==null&&<p className={styles.latency}
          title="Du décodage de la réponse HTTP au premier frame après insertion">
          Dernier affichage : {paintLatency} ms après réception HTTP (navigateur local).
        </p>}
      </div>
    </aside>
  </>;
}
