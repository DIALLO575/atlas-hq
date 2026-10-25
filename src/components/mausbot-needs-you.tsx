"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Icon } from "@/components/icon";
import { listWorkspaces } from "@/app/workspaces/actions";

type NeedsYouKind = "signed-out" | "usage-limit" | "out-of-credit" | "connection" | "place" | "question";
type NeedsYouItem = { id: string; kind: NeedsYouKind; at: number; title: string; botIds: string[]; threadId?: string; text?: string; app?: string };
type Payload = { source: "live-read-only"; mode: "needs-you"; canApprove: false; canDispatch: false; windowDays: number; items: NeedsYouItem[] };
type State = { status: "loading" | "offline" | "ready" | "error"; data?: Payload; error?: string };
const kindIcon: Record<NeedsYouKind,"bot"|"activity"|"apps"|"settings"|"inbox"> = {
  "signed-out":"settings","usage-limit":"activity","out-of-credit":"activity",
  connection:"apps",place:"settings",question:"bot",
};
function nextStep(item: NeedsYouItem) {
  if(item.kind==="question") return {href:"/agents",label:"Ouvrir les agents"};
  if(item.kind==="connection") return {href:"/apps",label:"Voir les applications"};
  return {href:"/engines",label:"Examiner le moteur"};
}
function when(at:number) {
  return new Intl.DateTimeFormat("fr-FR",{dateStyle:"short",timeStyle:"short"}).format(new Date(at));
}
function explanation(error?: string) {
  if(error==="MAUSBOT_PRECONNECTION_GATE_CLOSED" || error==="MAUSBOT_VIEWER_IDENTITY_UNVERIFIED")
    return "Lecture privée en attente : gate MAUSBOT ou correspondance d’identité non validé.";
  if(error==="MAUSBOT_NOT_CONFIGURED") return "Aucune instance MAUSBOT n’est configurée pour cet espace.";
  if(error==="ENGINE_WRITE_FORBIDDEN" || error==="WORKSPACE_FORBIDDEN")
    return "Les alertes privées sont réservées au propriétaire ou aux administrateurs autorisés.";
  if(error==="AUTH_REQUIRED") return "Connectez-vous pour consulter les alertes de votre workspace.";
  return "Impossible de vérifier les alertes MAUSBOT. Aucun résultat n’est supposé.";
}
export function MausbotNeedsYou({ workspaceId, mode = "inbox" }: { workspaceId?: string; mode?: "inbox" | "home" }) {
  const [selectedWorkspace, setSelectedWorkspace] = useState(workspaceId ?? "");
  const [workspaceIssue, setWorkspaceIssue] = useState("");
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<State>({status:"loading"});
  useEffect(() => {
    if(workspaceId) return;
    let active=true;
    void listWorkspaces().then(result=>{
      if(!active)return;
      if(result.status==="ready") setSelectedWorkspace(result.selectedId);
      else setWorkspaceIssue("Aucun workspace accessible.");
    }).catch(()=>{if(active)setWorkspaceIssue("Workspaces indisponibles.");});
    return ()=>{active=false;};
  },[workspaceId]);
  const activeId=workspaceId ?? selectedWorkspace;
  useEffect(()=>{
    if(!activeId) return;
    const abort=new AbortController();
    let busy=false;
    const load=async(first:boolean)=>{
      if(busy || abort.signal.aborted || (!first && document.visibilityState==="hidden"))return;
      busy=true;
      if(first) setState({status:"loading"});
      try{
        const response=await fetch("/api/engines/mausbot/needs-you?workspaceId="+encodeURIComponent(activeId),{
          credentials:"same-origin",cache:"no-store",signal:abort.signal,
        });
        const body=await response.json();
        if(!response.ok) {
          if(!abort.signal.aborted) setState({status:response.status===423 || response.status===503?"offline":"error",error:typeof body.error==="string"?body.error:"MAUSBOT_UNAVAILABLE"});
          return;
        }
        if(body.source!=="live-read-only" || body.mode!=="needs-you" ||
            body.canApprove!==false || body.canDispatch!==false || !Array.isArray(body.items))
          throw Error("NEEDS_YOU_RESPONSE_INVALID");
        if(!abort.signal.aborted)setState({status:"ready",data:body as Payload});
      }catch {
        if(!abort.signal.aborted)setState({status:"error",error:"MAUSBOT_UNAVAILABLE"});
      }finally{busy=false;}
    };
    void load(true);
    const interval=window.setInterval(()=>void load(false),30000);
    const visible=()=>{if(document.visibilityState==="visible")void load(false);};
    document.addEventListener("visibilitychange",visible);
    return ()=>{abort.abort();window.clearInterval(interval);document.removeEventListener("visibilitychange",visible);};
  },[activeId,revision]);
  const small=mode==="home";
  return <section className={"atlas-needs-you"+(small?" is-home":" is-inbox")} aria-label="Besoin de vous, MAUSBOT">
    {!small && <header className="atlas-needs-heading">
      <span className="atlas-needs-heading-icon"><Icon name="bot"/></span>
      <div><p className="atlas-needs-overline">MAUSBOT / NEEDS YOU</p><h2>Les agents ont besoin de vous</h2>
        <p>Questions et problèmes bloquants, selon l’identité et les droits du moteur.</p></div>
      <span className={"atlas-needs-state"+(state.status==="ready"?" is-ready":"")}>{state.status==="ready"?"Lecture privée":state.status==="loading"?"Vérification…":"Non connecté"}</span>
      <button type="button" className="atlas-needs-refresh" aria-label="Actualiser MAUSBOT" title="Actualiser MAUSBOT"
        disabled={!activeId||state.status==="loading"} onClick={()=>setRevision(v=>v+1)}><Icon name="rotate-ccw"/></button>
    </header>}
    {small && <div className="atlas-needs-mini-heading"><span>{state.status==="ready"?"Source MAUSBOT · lecture privée":state.status==="loading"?"Vérification MAUSBOT…":"MAUSBOT non connecté"}</span>
      {state.status==="ready"&&<strong>{state.data?.items.length??0} point{state.data?.items.length===1?"":"s"}</strong>}</div>}
    {workspaceIssue && <p className="atlas-needs-feedback" role="status">{workspaceIssue}</p>}
    {state.status==="loading" && <p className="atlas-needs-feedback" role="status">Vérification des éléments « Needs you » sur la source autorisée…</p>}
    {(state.status==="offline" || state.status==="error") && <div className="atlas-needs-disconnected">
      <Icon name="shield-check"/><div><strong>Source non disponible</strong><p>{explanation(state.error)}</p></div>
      {!small && <Link href="/engines">Moteurs IA <Icon name="arrow-right"/></Link>}
    </div>}
    {state.status==="ready" && (state.data?.items.length??0)===0 && <div className="atlas-needs-empty">
      <span><Icon name="shield-check"/></span><div><strong>Aucune intervention demandée</strong>
        <p>Le flux MAUSBOT ne signale aucun élément pour ce compte dans sa fenêtre de 7 jours.</p></div>
    </div>}
    {state.status==="ready" && !!state.data?.items.length && <ul className="atlas-needs-list">
      {state.data.items.slice(0,small?3:100).map(item=>{
        const step=nextStep(item);
        return <li key={item.kind+":"+item.id} className={"atlas-needs-item is-"+item.kind}>
          <span className="atlas-needs-kind-icon"><Icon name={kindIcon[item.kind]}/></span>
          <div className="atlas-needs-item-content">
            <div className="atlas-needs-item-top"><span>{item.kind==="question"?"QUESTION D’AGENT":item.kind==="connection"?"APPLICATION":"ATTENTION REQUISE"}</span><time dateTime={new Date(item.at).toISOString()}>{when(item.at)}</time></div>
            <h3>{item.title}{item.app?" · "+item.app:""}</h3>
            {item.text&&<p>{item.text}</p>}
            {!small && item.threadId&&<small>Fil associé : <code>{item.threadId}</code></small>}
            <div className="atlas-needs-item-footer"><span>MAUSBOT · consultation uniquement</span>
              <Link href={step.href}>{step.label} <Icon name="arrow-right"/></Link></div>
          </div>
        </li>;
      })}
      {small && state.data.items.length>3&&<li className="atlas-needs-more">+{state.data.items.length-3} autre(s) dans l’Inbox</li>}
    </ul>}
    {!small && <p className="atlas-needs-disclaimer"><Icon name="shield-check"/>
      Source : GET /api/needs-you de MAUSBOT. Les approbations du moteur restent dans ses conversations. ATLAS ne répond, ne reconnecte et n’exécute aucune action automatiquement (HTTP 423).</p>}
  </section>;
}
