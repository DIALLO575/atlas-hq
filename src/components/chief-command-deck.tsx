"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icon";
import { BrandLogo } from "@/components/brand-logo";
import type { Workspace } from "@/lib/workspaces/contract";
import type { ChiefReply } from "@/lib/chief/briefing";

type ChatEntry = { id: number; author: "user" | "chief"; text: string; reply?: ChiefReply };
type Thread = { id: number; title: string; entries: ChatEntry[] };
type GitHubView = {
  stage: "loading" | "unlinked" | "verified" | "ready" | "error";
  repositories: number; truncated: boolean; pullCount: number | null;
  pullTruncated: boolean; firstRepo: string | null; verified: number;
};
const sampleQuestions = [
  "Fais le point sur mes missions",
  "Quelles décisions m’attendent ?",
  "Montre la répartition des missions",
  "Quels dépôts GitHub sont accessibles ?",
];
const stages: Record<string,string> = {planned:"À lancer",active:"En cours",review:"En validation",done:"Terminée"};
const formatDate = (raw:string) => {
  const d=new Date(raw);
  return Number.isNaN(d.getTime()) ? "Date indisponible" :
    new Intl.DateTimeFormat("fr",{day:"2-digit",month:"short"}).format(d);
};
function ChartCard({ data }: {data: ChiefReply["chart"]}) {
  const maximum = Math.max(...data.map(item => item.value),1);
  const total = data.reduce((sum,item)=>sum+item.value,0);
  return <section className="atlas-chief-chart" aria-label="Répartition réelle des missions par statut">
    <div className="atlas-chief-card-title"><span><Icon name="activity"/> Répartition des missions</span>
      <small>{total} mission{total > 1 ? "s" : ""}</small></div>
    {total ? <div className="atlas-chief-chart-bars" role="img"
        aria-label={data.map(item=>item.label + " : " + item.value).join(", ")}>
      {data.map((item,index)=><div className="atlas-chief-chart-col" key={item.label}>
        <strong>{item.value}</strong>
        <div className="atlas-chief-chart-track"><span className={"is-bar-" + index}
          style={{height: (item.value / maximum * 100) + "%"}}/></div>
        <small>{item.label}</small>
      </div>)}
    </div> : <div className="atlas-chief-chart-empty">Aucune mission à représenter pour l’instant.</div>}
    <p>Répartition actuelle · Données Atlas, pas une tendance historique.</p>
  </section>;
}
function ReplyWidgets({reply,workspaceId,github}:{
  reply:ChiefReply;workspaceId:string;github:GitHubView;
}) {
  const cards = reply.intent === "briefing" || reply.intent === "activity";
  const showMissions = reply.intent === "briefing" || reply.intent === "missions";
  const showReviews = reply.intent === "briefing" || reply.intent === "decisions";
  return <div className="atlas-chief-widgets">
    {cards && <div className="atlas-chief-briefing">
      <div className="atlas-chief-widget-head"><span><Icon name="spark"/> Briefing du Chief</span>
        <span className="atlas-chief-source">Source : ATLAS</span></div>
      <div className="atlas-chief-metrics">
        <Link href={"/missions?workspaceId="+encodeURIComponent(workspaceId)}>
          <Icon name="activity"/><strong>{reply.counts.active}</strong><span>Missions en cours</span>
        </Link>
        <Link href={"/inbox?workspaceId="+encodeURIComponent(workspaceId)}>
          <Icon name="inbox"/><strong>{reply.counts.pendingDecisions}</strong><span>À décider</span>
        </Link>
        <Link href={"/missions?workspaceId="+encodeURIComponent(workspaceId)+"&status=review"}>
          <Icon name="layers"/><strong>{reply.counts.review}</strong><span>En validation</span>
        </Link>
        <Link href={"/missions?workspaceId="+encodeURIComponent(workspaceId)+"&status=done"}>
          <Icon name="apps"/><strong>{reply.counts.done}</strong><span>Terminées</span>
        </Link>
      </div>
    </div>}
    {(reply.intent==="briefing"||reply.intent==="activity") && <ChartCard data={reply.chart}/>}
    {showMissions && <section className="atlas-chief-list-card">
      <div className="atlas-chief-card-title"><span><Icon name="activity"/> Missions à suivre</span>
        <Link href={"/missions?workspaceId="+encodeURIComponent(workspaceId)}>Tout voir <Icon name="arrow-right"/></Link></div>
      {reply.missions.length ? reply.missions.map(mission=><Link
        href={"/missions?workspaceId="+encodeURIComponent(workspaceId)}
        className="atlas-chief-data-row" key={mission.id}>
        <span className="atlas-chief-data-mark"><Icon name="activity"/></span>
        <span className="atlas-chief-data-copy"><strong>{mission.title}</strong>
          <small>{stages[mission.status]} · Mis à jour le {formatDate(mission.updatedAt)}</small></span>
        {mission.priority==="high" && <span className="atlas-chief-high">Haute</span>}
        <Icon name="chevron-right"/></Link>)
      : <p className="atlas-chief-list-empty">Aucune mission dans ce workspace. <Link href="/missions">Créer une mission</Link></p>}
    </section>}
    {showReviews && <section className="atlas-chief-list-card">
      <div className="atlas-chief-card-title"><span><Icon name="inbox"/> Décisions et validations</span>
        <Link href={"/inbox?workspaceId="+encodeURIComponent(workspaceId)}>Tout voir <Icon name="arrow-right"/></Link></div>
      {reply.reviews.length ? reply.reviews.map(review=><Link
        href={"/inbox?workspaceId="+encodeURIComponent(workspaceId)} key={review.id}
        className="atlas-chief-data-row">
        <span className="atlas-chief-data-mark is-amber"><Icon name="inbox"/></span>
        <span className="atlas-chief-data-copy"><strong>{review.title}</strong>
          <small>En attente · {formatDate(review.createdAt)}</small></span>
        <span className="atlas-chief-awaiting">À examiner</span>
        <Icon name="chevron-right"/></Link>)
      : <p className="atlas-chief-list-empty">Aucune validation en attente visible avec votre rôle.</p>}
    </section>}
    {reply.intent==="github" && <section className="atlas-chief-list-card">
      <div className="atlas-chief-card-title"><span><BrandLogo slug="github" size={19}/> GitHub · Workspace</span>
        <Link href={"/apps/github?workspaceId="+encodeURIComponent(workspaceId)}>Piloter <Icon name="arrow-right"/></Link></div>
      <div className="atlas-chief-gh-widget">
        <span>{github.stage==="ready" ? "Dépôts accessibles" : github.stage==="verified" ? "Installation enregistrée" :
          github.stage==="loading" ? "Vérification…" : github.stage==="error" ? "Connexion indisponible" : "À connecter"}</span>
        <strong>{github.stage==="ready" ? github.repositories + (github.truncated ? "+" : "") : "—"}</strong>
        <small>{github.firstRepo ? "PR ouvertes · "+github.firstRepo+" : "+(github.pullCount===null?"—":github.pullCount+(github.pullTruncated?"+":"")) :
          "Connecteur de lecture seule · Aucune donnée simulée"}</small>
      </div>
    </section>}
    {reply.limited && <p className="atlas-chief-limit">Vue limitée aux 200 derniers éléments de chaque type. Les chiffres reflètent ces éléments.</p>}
  </div>;
}

export function ChiefCommandDeck({workspace,workspaces,initialReply}:{
  workspace:Workspace;workspaces:Workspace[];initialReply:ChiefReply;
}) {
  const router=useRouter();
  const [threads,setThreads]=useState<Thread[]>([{id:1,title:"Briefing du workspace",
    entries:[{id:1,author:"chief",text:initialReply.text,reply:initialReply}]}]);
  const [activeId,setActiveId]=useState(1);
  const [draft,setDraft]=useState("");
  const [sending,setSending]=useState(false);
  const [notice,setNotice]=useState<string|null>(null);
  const [showThreads,setShowThreads]=useState(false);
  const [github,setGithub]=useState<GitHubView>({
    stage:"loading",repositories:0,truncated:false,pullCount:null,pullTruncated:false,firstRepo:null,verified:0,
  });
  const scrollerRef=useRef<HTMLDivElement>(null);
  const hasMessagedRef=useRef(false);
  const thread=threads.find(item=>item.id===activeId);
  const [requestCount,setRequestCount]=useState(0);
  useEffect(()=>{
    const controller=new AbortController();
    const endpoint="/api/apps/github?workspaceId="+encodeURIComponent(workspace.id);
    const reader=async <T,>(query:string):Promise<T>=>{
      const result=await fetch(endpoint+query,{cache:"no-store",credentials:"same-origin",signal:controller.signal});
      if(!result.ok) throw new Error("lecture GitHub indisponible");
      return result.json() as Promise<T>;
    };
    (async()=>{
      try{
        const connections=await reader<{installations:{installationId:number;status:string;repositorySelection:string;
          ownershipVerifiedAt:string|null;repositoriesVerifiedAt:string|null}[]}>("&view=connections");
        const verified=connections.installations.filter(item=>item.status==="repositories-ready" &&
          ["selected","all"].includes(item.repositorySelection) && item.ownershipVerifiedAt && item.repositoriesVerifiedAt);
        if(!verified.length){if(!controller.signal.aborted)setGithub({
          stage:"unlinked",repositories:0,truncated:false,pullCount:null,pullTruncated:false,firstRepo:null,verified:0});return;}
        if(!controller.signal.aborted)setGithub(v=>({...v,stage:"verified",verified:verified.length}));
        const id=verified[0].installationId;
        const repos=await reader<{repositories:{id:number;fullName:string}[];truncated:boolean}>(
          "&view=repositories&installationId="+id);
        let pullCount:number|null=null,pullTruncated=false,firstRepo:string|null=null;
        if(repos.repositories.length) {
          firstRepo=repos.repositories[0].fullName;
          try{
            const prs=await reader<{pullRequests:unknown[];truncated:boolean}>(
              "&view=pulls&installationId="+id+"&repositoryId="+repos.repositories[0].id);
            pullCount=prs.pullRequests.length;pullTruncated=prs.truncated;
          }catch{ /* Repo count remains real even if PR provider request is unavailable. */ }
        }
        if(!controller.signal.aborted)setGithub({stage:"ready",repositories:repos.repositories.length,
          truncated:repos.truncated,pullCount,pullTruncated,firstRepo,verified:verified.length});
      }catch{if(!controller.signal.aborted)setGithub(v=>({...v,stage:"error"}));}
    })();
    return ()=>controller.abort();
  },[workspace.id,requestCount]);
  useEffect(()=>{if(hasMessagedRef.current && scrollerRef.current) {
    scrollerRef.current.scrollTo({top:scrollerRef.current.scrollHeight,behavior:"smooth"});
  }},[activeId,thread?.entries.length]);

  const send=async(raw:string)=>{
    const value=raw.trim();
    if(!value||sending||value.length>700)return;
    const destination=activeId;
    hasMessagedRef.current=true;
    setDraft("");setNotice(null);setSending(true);
    setThreads(all=>all.map(item=>item.id===destination?{
      ...item,title:item.entries.length===0?value.slice(0,42):item.title,
      entries:[...item.entries,{id:Date.now(),author:"user" as const,text:value}]
    }:item));
    try{
      const response=await fetch("/api/chief",{method:"POST",cache:"no-store",credentials:"same-origin",
        headers:{"Content-Type":"application/json"},body:JSON.stringify({workspaceId:workspace.id,message:value})});
      if(!response.ok)throw new Error("Lecture du briefing impossible. Vérifiez votre session et réessayez.");
      const data=await response.json() as {reply:ChiefReply};
      setThreads(all=>all.map(item=>item.id===destination?{...item,entries:[
        ...item.entries,{id:Date.now()+1,author:"chief" as const,text:data.reply.text,reply:data.reply}
      ]}:item));
    }catch(error){setNotice(error instanceof Error?error.message:"Le service Chief est indisponible.");}
    finally{setSending(false);}
  };
  const startNew=()=>{
    const id=Date.now();
    setThreads(list=>[{id,title:"Nouvelle conversation",entries:[]},...list].slice(0,10));
    setActiveId(id);setDraft("");setNotice(null);setShowThreads(false);
  };
  const changeWorkspace=(id:string)=>{
    if(id===workspace.id)return;
    router.push("/chief?workspaceId="+encodeURIComponent(id));
  };
  const activeReply=[...(thread?.entries??[])].reverse().find(m=>m.reply)?.reply??initialReply;
  return <>
    <header className="atlas-chief-top">
      <div className="atlas-chief-heading"><span className="atlas-chief-hero-icon"><Icon name="spark"/></span>
        <div><p className="atlas-overline">ATLAS HQ / COMMAND DECK</p>
          <h1>Chief of Staff <span aria-hidden="true">✦</span></h1>
          <p>Votre cockpit conversationnel, relié aux données de votre espace.</p></div>
      </div>
      <div className="atlas-chief-top-actions">
        <label className="atlas-chief-workspace-switch">Workspace
          <select value={workspace.id} onChange={event=>changeWorkspace(event.target.value)}>
            {workspaces.map(space=><option key={space.id} value={space.id}>{space.name}</option>)}
          </select>
        </label>
        <button type="button" onClick={()=>{setRequestCount(x=>x+1);void send("Fais le point sur mes missions");}}
          disabled={sending} className="atlas-chief-refresh" aria-label="Actualiser le briefing"><Icon name="rotate-ccw"/></button>
      </div>
    </header>

    <div className="atlas-chief-deck">
      <aside className={"atlas-chief-threads"+(showThreads?" is-open":"")} aria-label="Conversations de cette session">
        <div className="atlas-chief-rail-heading"><strong>Conversations</strong><button onClick={startNew}
          type="button" aria-label="Nouvelle conversation"><Icon name="apps"/></button></div>
        <button type="button" className="atlas-chief-new-thread" onClick={startNew}>
          <Icon name="apps"/> Nouvelle conversation</button>
        <span className="atlas-chief-rail-overline">CETTE SESSION</span>
        <div className="atlas-chief-thread-list">{threads.map(item=><button
          key={item.id} type="button" onClick={()=>{setActiveId(item.id);setShowThreads(false);}}
          className={item.id===activeId?"is-current":""}>
          <Icon name="inbox"/><span>{item.title}</span></button>)}</div>
        <p className="atlas-chief-thread-disclaimer">Échanges temporaires : ils ne sont pas enregistrés après fermeture de la page.</p>
        <div className="atlas-chief-rail-bottom"><Icon name="layers"/><span>{workspace.name}</span></div>
      </aside>

      <section className="atlas-chief-conversation" aria-label="Dialogue avec le Chief">
        <div className="atlas-chief-dialog-heading">
          <button type="button" className="atlas-chief-mobile-threads" onClick={()=>setShowThreads(v=>!v)}
            aria-label="Afficher les conversations"><Icon name="menu"/></button>
          <span className="atlas-chief-online-dot"/><div><strong>Chief · Briefings Atlas</strong>
            <small>Consultation de données réelles · IA libre non connectée</small></div>
          <span className="atlas-chief-readonly">Lecture seule</span>
        </div>
        <div className="atlas-chief-chat-scroller" ref={scrollerRef}>
          {thread?.entries.length ? thread.entries.map(entry=><div
            className={"atlas-chief-message is-"+entry.author} key={entry.id}>
            {entry.author==="chief" && <span className="atlas-chief-avatar"><Icon name="spark"/></span>}
            <div className="atlas-chief-message-content">
              <p>{entry.text}</p>
              {entry.reply && <ReplyWidgets reply={entry.reply} workspaceId={workspace.id} github={github}/>}
            </div>
          </div>) : <div className="atlas-chief-welcome">
            <span><Icon name="spark"/></span><h2>Sur quoi travaillons-nous ?</h2>
            <p>Posez une question sur les missions, les décisions ou les données GitHub de votre workspace.</p>
          </div>}
        </div>
        <div className="atlas-chief-input-area">
          {notice && <p role="alert" className="atlas-chief-message-error">{notice}</p>}
          <div className="atlas-chief-prompts">
            {sampleQuestions.map(prompt=><button key={prompt} type="button"
              disabled={sending} onClick={()=>void send(prompt)}>
              <Icon name="spark"/>{prompt}</button>)}
          </div>
          <form className="atlas-chief-composer" onSubmit={event=>{event.preventDefault();void send(draft);}}>
            <label className="sr-only" htmlFor="atlas-chief-input">Demandez quelque chose au Chief</label>
            <textarea id="atlas-chief-input" rows={1} value={draft} maxLength={700}
              onChange={event=>setDraft(event.target.value)}
              onKeyDown={event=>{if(event.key==="Enter"&&!event.shiftKey){event.preventDefault();void send(draft);}}}
              placeholder="Demandez un briefing, des décisions, un graphique…"/>
            <button type="submit" disabled={!draft.trim()||sending} aria-label="Envoyer au Chief">
              <Icon name={sending?"rotate-ccw":"arrow-up"}/></button>
          </form>
          <p className="atlas-chief-input-disclaimer">Réponses calculées par Atlas. Aucun agent IA externe ni action automatique n’est exécuté.</p>
        </div>
      </section>

      <aside className="atlas-chief-context" aria-label="Contexte du workspace">
        <section className="atlas-chief-context-card">
          <div className="atlas-chief-side-title"><strong><Icon name="layers"/> Contexte actif</strong>
            <span className="atlas-chief-side-live"><span/> Atlas</span></div>
          <div className="atlas-chief-context-line"><span>Workspace</span><strong>{workspace.name}</strong></div>
          <div className="atlas-chief-context-line"><span>Votre rôle</span><strong>{
            workspace.role==="owner"?"Propriétaire":workspace.role==="admin"?"Admin":"Membre"}</strong></div>
          <div className="atlas-chief-context-line"><span>Sources</span><strong>Missions · Inbox · GitHub</strong></div>
        </section>
        <section className="atlas-chief-context-card">
          <div className="atlas-chief-side-title"><strong><Icon name="activity"/> Mes activités</strong>
            <Link href={"/missions?workspaceId="+encodeURIComponent(workspace.id)}>Voir tout</Link></div>
          <div className="atlas-chief-context-number"><strong>{activeReply.counts.total}</strong><span>Missions visibles</span></div>
          <div className="atlas-chief-mini-rows">
            <div><span><Icon name="activity"/> En cours</span><b>{activeReply.counts.active}</b></div>
            <div><span><Icon name="inbox"/> À décider</span><b>{activeReply.counts.pendingDecisions}</b></div>
            <div><span><Icon name="layers"/> Terminées</span><b>{activeReply.counts.done}</b></div>
          </div>
        </section>
        <section className="atlas-chief-context-card">
          <div className="atlas-chief-side-title"><strong><Icon name="activity"/> Missions prioritaires</strong>
            <Link href={"/missions?workspaceId="+encodeURIComponent(workspace.id)}>Tout voir</Link></div>
          {activeReply.missions.filter(m=>m.priority==="high").length ?
            activeReply.missions.filter(m=>m.priority==="high").slice(0,3).map(mission=>
            <Link key={mission.id} href={"/missions?workspaceId="+encodeURIComponent(workspace.id)}
              className="atlas-chief-side-mission"><strong>{mission.title}</strong>
              <small>{stages[mission.status]}</small></Link>)
            : <p className="atlas-chief-side-empty">Aucune mission prioritaire visible.</p>}
        </section>
        <section className="atlas-chief-context-card">
          <div className="atlas-chief-side-title"><strong><BrandLogo slug="github" size={17}/> GitHub Control Center</strong>
            <Link href={"/apps/github?workspaceId="+encodeURIComponent(workspace.id)}>Ouvrir</Link></div>
          <div className="atlas-chief-gh-mini">
            <div><strong>{github.stage==="ready"?github.repositories+(github.truncated?"+":""):"—"}</strong>
              <small>Dépôts autorisés</small></div>
            <div><strong>{github.pullCount===null?"—":github.pullCount+(github.pullTruncated?"+":"")}</strong>
              <small>PR · 1 dépôt</small></div>
          </div>
          <p>{github.stage==="loading"?"Vérification GitHub…" :
            github.stage==="unlinked"?"Aucune installation autorisée." :
            github.stage==="verified"?"Installation vérifiée, lecture en cours." :
            github.stage==="ready"?"Données du connecteur GitHub." :
            "Lecture GitHub indisponible."}</p>
        </section>
        <section className="atlas-chief-context-card">
          <div className="atlas-chief-side-title"><strong><Icon name="spark"/> Actions utiles</strong></div>
          <div className="atlas-chief-shortcuts">
            <Link href={"/missions?workspaceId="+encodeURIComponent(workspace.id)+"#new-mission"}><Icon name="apps"/> Créer une mission</Link>
            <Link href={"/inbox?workspaceId="+encodeURIComponent(workspace.id)}><Icon name="inbox"/> Décisions Inbox</Link>
            <Link href={"/apps/github?workspaceId="+encodeURIComponent(workspace.id)}><Icon name="link"/> Piloter GitHub</Link>
            <Link href="/agents"><Icon name="bot"/> Agents à connecter</Link>
          </div>
        </section>
      </aside>
    </div>
  </>;
}
