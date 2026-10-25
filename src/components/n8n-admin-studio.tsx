"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Icon } from "@/components/icon";

type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
const presets: { label: string; method: Method; path: string; query?: string }[] = [
  {label:"Workflows",method:"GET",path:"workflows",query:'{"limit":20}'},
  {label:"Exécutions",method:"GET",path:"executions",query:'{"limit":20,"includeData":false}'},
  {label:"Projets",method:"GET",path:"projects",query:'{"limit":20}'},
  {label:"Utilisateurs",method:"GET",path:"users",query:'{"limit":20}'},
  {label:"Tags",method:"GET",path:"tags",query:'{"limit":20}'},
  {label:"Identifiants",method:"GET",path:"credentials",query:'{"limit":20}'},
  {label:"Créer workflow",method:"POST",path:"workflows"},
  {label:"Activer workflow",method:"POST",path:"workflows/WORKFLOW_ID/activate"},
  {label:"Désactiver workflow",method:"POST",path:"workflows/WORKFLOW_ID/deactivate"},
  {label:"Supprimer workflow",method:"DELETE",path:"workflows/WORKFLOW_ID"},
  {label:"Audit",method:"POST",path:"audit"},
];
export function N8nAdminStudio({workspaceId,isOwner}:{workspaceId:string;isOwner:boolean}) {
  const [method,setMethod]=useState<Method>("GET");
  const [path,setPath]=useState("workflows");
  const [query,setQuery]=useState('{"limit":20}');
  const [body,setBody]=useState("");
  const [confirmation,setConfirmation]=useState("");
  const [busy,setBusy]=useState(false);
  const [result,setResult]=useState<{workspaceId:string;value:unknown;path:string;method:string}|null>(null);
  const [failure,setFailure]=useState<{workspaceId:string;text:string}|null>(null);
  useEffect(()=>{setResult(null);setFailure(null);setConfirmation("");},[workspaceId]);
  function choose(p:typeof presets[number]) {
    setMethod(p.method);setPath(p.path);setQuery(p.query??"{}");
    setResult(null);setFailure(null);setConfirmation("");
  }
  async function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if(!workspaceId||!isOwner||busy)return;
    const w=workspaceId;
    const p=path.trim();
    if(!/^[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*$/.test(p)) {
      setFailure({workspaceId:w,text:"Chemin API invalide : n’utilisez pas une URL complète."});return;
    }
    if(method!=="GET"&&confirmation!=="CONFIRM "+method+" "+p){
      setFailure({workspaceId:w,text:"Tapez la confirmation exacte avant de modifier n8n."});return;
    }
    let q:unknown; let b:unknown;
    try{q=JSON.parse(query||"{}");if(body.trim())b=JSON.parse(body);}
    catch{setFailure({workspaceId:w,text:"Paramètres ou corps JSON invalide."});return;}
    setBusy(true);setResult(null);setFailure(null);
    try{
      const options:RequestInit=method==="GET"
        ? {method:"GET",credentials:"same-origin",cache:"no-store"}
        : {method:"POST",credentials:"same-origin",cache:"no-store",
          headers:{"Content-Type":"application/json"},
          body:JSON.stringify({workspaceId:w,method,path:p,query:q,
            ...(b===undefined?{}:{body:b}),confirmation})};
      const url=method==="GET"
        ? "/api/apps/n8n/admin?"+new URLSearchParams({workspaceId:w,path:p,query:JSON.stringify(q)})
        : "/api/apps/n8n/admin";
      const response=await fetch(url,options);
      const json=await response.json() as {source?:string;error?:string;data?:unknown};
      if(!response.ok||json.source!=="n8n-public-api")throw Error(json.error??"N8N_ADMIN_UNAVAILABLE");
      setResult({workspaceId:w,value:json.data,path:p,method});
      if(method!=="GET")setConfirmation("");
    }catch(error){setFailure({workspaceId:w,text:error instanceof Error?error.message:"N8N_ADMIN_UNAVAILABLE"});}
    finally{setBusy(false);}
  }
  return <section className="n8n-panel n8n-data-panel">
    <div className="n8n-section-heading"><div><p className="n8n-eyebrow">ATLAS / N8N / PROPRIÉTAIRE</p>
      <h2>API Admin — votre n8n réel</h2>
      <p>Accès aux endpoints de l’API publique n8n sous votre session propriétaire Atlas.
        La clé API reste sur le serveur.</p></div><span className="n8n-small-pill">Propriétaire uniquement</span></div>
    {!isOwner&&<p className="n8n-warning" role="alert">Cette console exige le rôle Propriétaire du workspace Atlas lié à n8n.</p>}
    <p className="n8n-note">API REST publique : la disponibilité dépend de votre édition n8n.
      Les outils MCP et déclenchements webhook restent des transports distincts.</p>
    <div className="n8n-admin-presets">
      {presets.map(p=><button className="n8n-outline-button" type="button" key={p.label}
        disabled={!isOwner||busy} onClick={()=>choose(p)}>{p.label}</button>)}
    </div>
    <form className="n8n-admin-form" onSubmit={e=>void submit(e)}>
      <div className="n8n-admin-row">
        <label>Méthode<select value={method} disabled={!isOwner||busy}
          onChange={e=>{setMethod(e.target.value as Method);setConfirmation("");}}>
          {(["GET","POST","PUT","PATCH","DELETE"] as const).map(m=><option key={m}>{m}</option>)}
        </select></label>
        <label>Chemin relatif /api/v1/<input value={path} required spellCheck={false}
          disabled={!isOwner||busy} maxLength={400}
          onChange={e=>{setPath(e.target.value);setConfirmation("");}}/></label>
      </div>
      <label>Paramètres JSON<textarea rows={2} spellCheck={false} disabled={!isOwner||busy}
        value={query} onChange={e=>setQuery(e.target.value)}/></label>
      {method!=="GET"&&<>
        <label>Corps JSON (si nécessaire)<textarea rows={6} spellCheck={false} disabled={!isOwner||busy}
          value={body} onChange={e=>setBody(e.target.value)}
          placeholder='{"name":"Workflow Atlas","nodes":[],"connections":{},"settings":{}}'/></label>
        <p className="n8n-warning">Opération réelle : la modification ou suppression peut impacter SHADORON.
          Pour confirmer, tapez exactement <code>{"CONFIRM "+method+" "+path.trim()}</code>.</p>
        <label>Confirmation<input value={confirmation} disabled={!isOwner||busy}
          onChange={e=>setConfirmation(e.target.value)} autoComplete="off"/></label>
      </>}
      <button className="n8n-primary-cta" disabled={!workspaceId||!isOwner||busy} type="submit">
        <Icon name={method==="GET"?"search":"shield-check"}/>
        {busy?"Appel en cours…":method==="GET"?"Lire depuis n8n":"Exécuter sur n8n"}
      </button>
    </form>
    {failure?.workspaceId===workspaceId&&<p className="n8n-warning" role="alert">{failure.text}</p>}
    {result?.workspaceId===workspaceId&&<div className="n8n-admin-response" role="status">
      <strong>Réponse n8n : {result.method} /api/v1/{result.path}</strong>
      <pre>{JSON.stringify(result.value,null,2)?.slice(0,45000)}</pre>
      <small>Réponse consultée dans votre session ; aucun secret n8n n’est enregistré dans Atlas.</small>
    </div>}
  </section>;
}
