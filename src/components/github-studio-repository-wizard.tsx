"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Icon } from "@/components/icon";

type Draft = {name:string;description:string;private:boolean;autoInit:boolean};
type PermissionState = "granted" | "missing" | "unavailable";
type PreviewResult = {preview:Draft;canExecute:false;executionEnabled:boolean;permissionState:PermissionState;nextStep:string};
type Approval = {approved:true;receipt:string;expiresAt:number;canExecute:true};
type CreationResult={operationId:string;state:string;repository?:{id:number;name:string;url:string}};
const errors:Record<string,string>={
  INVALID_REQUEST:"Vérifiez les informations de votre dépôt.",
  INVALID_INPUT:"Utilisez uniquement lettres, chiffres, points, tirets et underscores.",
  AUTH_REQUIRED:"Votre session Atlas a expiré. Reconnectez-vous.",
  AUTH_UNAVAILABLE:"Le service d'authentification est indisponible.",
  WORKSPACE_FORBIDDEN:"Un rôle propriétaire ou administrateur est requis.",
  WORKSPACE_UNAVAILABLE:"Impossible de vérifier les droits du workspace.",
  GITHUB_NOT_AUTHORIZED:"Installation GitHub non vérifiée pour ce workspace.",
  CONNECTIONS_UNAVAILABLE:"Impossible de lire la connexion GitHub.",
  STUDIO_NOT_CONFIGURED:"Les secrets Studio ne sont pas disponibles sur cet environnement.",
  FORBIDDEN_ORIGIN:"La demande doit provenir du domaine Atlas officiel.",
  STUDIO_APPROVAL_DISABLED:"L'approbation est réservée à une Preview sandbox approuvée.",
  GITHUB_WRITE_NOT_APPROVED:"GitHub n'a pas encore confirmé la permission Write sur cette installation.",
  GITHUB_PERMISSION_UNAVAILABLE:"Impossible de revérifier la permission GitHub. Aucun accord enregistré.",
  APPROVAL_NAME_MISMATCH:"Le nom confirmé doit être exactement celui du dépôt.",
  APPROVAL_REQUIRED:"Confirmez explicitement votre demande.",
  SANDBOX_ONLY:"L'approbation n'est possible que pour la sandbox configurée.",
};

export function GitHubStudioRepositoryWizard({workspaceId,installationId,canManage,ready}:{
  workspaceId:string;installationId:number|null;canManage:boolean;ready:boolean;
}) {
  const [draft,setDraft]=useState<Draft>({name:"",description:"",private:true,autoInit:true});
  const [preview,setPreview]=useState<PreviewResult|null>(null);
  const [approval,setApproval]=useState<Approval|null>(null);
  const [created,setCreated]=useState<CreationResult|null>(null);
  const [typedName,setTypedName]=useState("");
  const [consent,setConsent]=useState(false);
  const [problem,setProblem]=useState<string|null>(null);
  const [working,setWorking]=useState<"check"|"approve"|"create"|null>(null);
  const requestRef=useRef<AbortController|null>(null);
  const approvalKey=useRef<string|null>(null);
  useEffect(()=>()=>requestRef.current?.abort(),[]);
  // The server approval receipt expires after five minutes. Never leave
  // an expired approval displayed as valid if the user stays on this view.
  useEffect(()=>{
    if(!approval)return;
    const delay=Math.min(300000,Math.max(0,approval.expiresAt-Date.now()));
    const timeout=window.setTimeout(()=>setApproval(null),delay);
    return ()=>window.clearTimeout(timeout);
  },[approval]);
  const permitted=canManage && ready && installationId!==null;
  const permission=preview?.permissionState ?? "unavailable";
  const canApprove=Boolean(permitted && preview && permission==="granted" &&
    typedName===preview.preview.name && consent && !working);
  const step=approval ? 3 : preview ? 2 : 1;

  function reset(next:Partial<Draft>) {
    requestRef.current?.abort();
    approvalKey.current=null;
    setWorking(null);
    setDraft(current=>({...current,...next}));
    setPreview(null);setApproval(null);setCreated(null);setTypedName("");setConsent(false);setProblem(null);
  }

  async function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if(!permitted || working)return;
    requestRef.current?.abort();
    const controller=new AbortController();
    requestRef.current=controller;
    setWorking("check");setProblem(null);setApproval(null);setCreated(null);setPreview(null);setTypedName("");setConsent(false);
    approvalKey.current=null;
    try {
      const response=await fetch("/api/apps/github/studio/repositories/preview",{
        method:"POST",credentials:"same-origin",cache:"no-store",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({...draft,workspaceId,installationId}),signal:controller.signal,
      });
      const data=await response.json();
      if(controller.signal.aborted)return;
      if(!response.ok) {
        setProblem(errors[String(data?.error)]??"La demande ne peut pas être vérifiée.");
        return;
      }
      if(data?.canExecute !== false || typeof data?.executionEnabled!=="boolean" || !data?.preview ||
         !["granted","missing","unavailable"].includes(data?.permissionState)) {
        setProblem("Réponse de vérification inattendue.");return;
      }
      approvalKey.current=crypto.randomUUID();
      setPreview(data as PreviewResult);
    }catch{
      if(!controller.signal.aborted)setProblem("Atlas ne répond pas. Réessayez.");
    }finally {
      if(!controller.signal.aborted)setWorking(null);
    }
  }

  async function approve() {
    if(!canApprove || !preview || !approvalKey.current)return;
    const controller=new AbortController();
    requestRef.current?.abort();
    requestRef.current=controller;
    setWorking("approve");setProblem(null);
    try{
      const response=await fetch("/api/apps/github/studio/repositories/approve",{
        method:"POST",credentials:"same-origin",cache:"no-store",
        headers:{"Content-Type":"application/json","idempotency-key":approvalKey.current},
        body:JSON.stringify({...preview.preview,workspaceId,installationId,typedName,approved:true}),
        signal:controller.signal,
      });
      const data=await response.json();
      if(controller.signal.aborted)return;
      if(!response.ok){
        setProblem(errors[String(data?.error)]??"La confirmation sécurisée est indisponible.");
        return;
      }
      if(data?.approved!==true || data?.canExecute!==true ||
        typeof data?.receipt!=="string" || !Number.isFinite(data?.expiresAt)){
        setProblem("Confirmation inattendue : aucun accord enregistré.");return;
      }
      setApproval(data as Approval);
    }catch{
      if(!controller.signal.aborted)setProblem("Impossible d'enregistrer l'accord temporaire.");
    }finally{
      if(!controller.signal.aborted)setWorking(null);
    }
  }

  async function execute(){
    if(!preview?.executionEnabled || !approval || !approvalKey.current ||
        permission!=="granted" || typedName!==preview.preview.name || !consent || working)return;
    const controller=new AbortController();
    requestRef.current?.abort();requestRef.current=controller;
    setWorking("create");setProblem(null);
    try {
      const response=await fetch("/api/apps/github/studio/repositories/execute",{
        method:"POST",credentials:"same-origin",cache:"no-store",
        headers:{"Content-Type":"application/json","idempotency-key":approvalKey.current,
          "x-studio-approval":approval.receipt},
        body:JSON.stringify({...preview.preview,workspaceId,installationId,confirmed:true}),
        signal:controller.signal,
      });
      const data=await response.json();
      if(controller.signal.aborted)return;
      if(!response.ok){
        setProblem(String(data?.error)==="STUDIO_USER_AUTH_REQUIRED"?
          "Autorisez votre compte GitHub avec le bouton OAuth, puis confirmez à nouveau.":
          "Création indisponible ("+String(data?.error??"UNKNOWN")+"). Aucune nouvelle tentative automatique.");
        return;
      }
      if(typeof data?.operationId!=="string" || typeof data?.state!=="string"){
        setProblem("Résultat incertain. Vérifiez votre compte GitHub avant de réessayer.");
        return;
      }
      setCreated(data as CreationResult);setApproval(null);
    }catch{
      if(!controller.signal.aborted)setProblem("Résultat incertain. Vérifiez GitHub avant de réessayer.");
    }finally{if(!controller.signal.aborted)setWorking(null);}
  }

  return <section className="atlas-gh-studio" aria-label="GitHub Repository Studio">
    <header className="atlas-gh-studio-head">
      <div className="atlas-gh-studio-heading">
        <span className="atlas-gh-studio-kicker"><Icon name="spark"/> ATLAS / GITHUB STUDIO</span>
        <h2>Donnez vie à votre prochain dépôt<span className="atlas-gh-studio-dot">.</span></h2>
        <p>{"Un espace clair pour préparer, contrôler et approuver votre projet avant toute action sur GitHub."}</p>
      </div>
      <div className="atlas-gh-studio-state"><span aria-hidden="true"/> MODE PRÉPARATION</div>
    </header>

    <div className="atlas-gh-studio-steps" aria-label="Progression de la demande">
      {[
        {number:1,title:"Configurer",desc:"Définir le dépôt"},
        {number:2,title:"Vérifier",desc:"Droits & paramètres"},
        {number:3,title:"Approuver",desc:"Accord explicite"},
      ].map(item=><div key={item.number} className={"atlas-gh-studio-step "+(step>=item.number?"is-current":"")}>
        <span className="atlas-gh-studio-step-number">{step>item.number?<Icon name="spark"/>:item.number}</span>
        <span><strong>{item.title}</strong><small>{item.desc}</small></span>
      </div>)}
    </div>

    <div className="atlas-gh-studio-layout">
      <div className="atlas-gh-studio-workspace">
        <div className="atlas-gh-studio-panel-title"><span className="atlas-gh-studio-panel-icon"><Icon name="layers"/></span>
          <div><h3>Configuration</h3><p>Personnalisez votre dépôt GitHub.</p></div>
          <span className="atlas-gh-studio-index">01 / 03</span></div>
        <form className="atlas-gh-studio-form" onSubmit={(event)=>void submit(event)}>
          <label className="atlas-gh-studio-field">Nom du dépôt <span>*</span>
            <input name="repositoryName" value={draft.name} required maxLength={100}
              pattern="[A-Za-z0-9_.-]+" placeholder="ex. atlas-projet"
              autoComplete="off" onChange={event=>reset({name:event.target.value})}/>
            <small>Un nom court, unique et facile à retrouver.</small>
          </label>
          <label className="atlas-gh-studio-field">Description
            <textarea name="description" value={draft.description} maxLength={350} rows={3}
              placeholder="Une phrase pour présenter votre idée..."
              onChange={event=>reset({description:event.target.value})}/>
            <small>{draft.description.length} / 350 caractères</small>
          </label>

          <fieldset className="atlas-gh-studio-visibility">
            <legend>Visibilité du dépôt</legend>
            <label className={draft.private?"is-selected":""}>
              <input type="radio" name="visibility" checked={draft.private}
                onChange={()=>reset({private:true})}/>
              <span className="atlas-gh-studio-choice-icon"><Icon name="layers"/></span>
              <span><strong>Privé</strong><small>Réservé aux personnes autorisées</small></span>
            </label>
            <label className={!draft.private?"is-selected":""}>
              <input type="radio" name="visibility" checked={!draft.private}
                onChange={()=>reset({private:false})}/>
              <span className="atlas-gh-studio-choice-icon"><Icon name="grid"/></span>
              <span><strong>Public</strong><small>Visible par toute la communauté</small></span>
            </label>
          </fieldset>

          <label className="atlas-gh-studio-check">
            <input type="checkbox" checked={draft.autoInit}
              onChange={event=>reset({autoInit:event.target.checked})}/>
            <span><strong>Ajouter un README</strong><small>{"Créer un fichier d'accueil dès le départ"}</small></span>
          </label>
          {!canManage && <p className="atlas-gh-studio-caution" role="status">
            Seul un propriétaire ou administrateur peut approuver la demande.
          </p>}
          {canManage && !ready && <p className="atlas-gh-studio-caution" role="status">
            Connectez et vérifiez votre installation GitHub pour continuer.
          </p>}
          <button className="atlas-gh-studio-submit" type="submit" disabled={!permitted||Boolean(working)}>
            <Icon name="spark"/> {working==="check"?"Analyse en cours…":"Vérifier la configuration"}
            <Icon name="arrow-right"/>
          </button>
        </form>

        {preview && <section className="atlas-gh-studio-approval" aria-label="Approbation de la création">
          <div className="atlas-gh-studio-panel-title">
            <span className="atlas-gh-studio-panel-icon"><Icon name="settings"/></span>
            <div><h3>Approbation explicite</h3><p>{"Un accord précis pour ce dépôt, jamais une création automatique."}</p></div>
            <span className="atlas-gh-studio-index">02 / 03</span>
          </div>
          <div className={"atlas-gh-studio-permission "+(permission==="granted"?"is-granted":"")}>
            <span className="atlas-gh-studio-permission-icon"><Icon name={permission==="granted"?"spark":"settings"}/></span>
            <div><strong>{permission==="granted"?"Permission Write confirmée par GitHub":
              permission==="missing"?"Permission Write non approuvée pour cette installation":
              "Permission Write non vérifiable"}</strong>
              <p>{permission==="granted"?
                "L'installation accorde la création. Votre confirmation reste indispensable.":
                permission==="missing"?
                "Le propriétaire doit accepter les nouveaux droits dans les paramètres GitHub App.":
                "Atlas ne peut pas encore confirmer les nouveaux droits auprès de GitHub."}</p>
            </div>
          </div>
          {preview.executionEnabled && permission==="granted" && <form method="POST"
            action="/api/apps/github/studio/oauth/start" className="atlas-gh-studio-oauth">
            <input type="hidden" name="workspaceId" value={workspaceId}/>
            <input type="hidden" name="installationId" value={installationId??""}/>
            <button type="submit" className="atlas-gh-studio-approve" disabled={Boolean(working)}>
              <Icon name="spark"/> Autoriser mon compte GitHub
            </button>
            <small>Autorisation utilisateur temporaire nécessaire avant la création.</small>
          </form>}
          <label className="atlas-gh-studio-field">{"Recopiez le nom exact du dépôt pour confirmer"}
            <input value={typedName} onChange={event=>{setTypedName(event.target.value);setApproval(null);}}
              placeholder={preview.preview.name} autoComplete="off" disabled={permission!=="granted"}/>
          </label>
          <label className="atlas-gh-studio-consent">
            <input type="checkbox" checked={consent}
              disabled={permission!=="granted"}
              onChange={event=>{setConsent(event.target.checked);setApproval(null);}}/>
            <span>{"J’approuve ces paramètres et je comprends que seul un clic explicite sur Créer effectuera la création GitHub."}</span>
          </label>
          <button type="button" className="atlas-gh-studio-approve" onClick={()=>void approve()}
            disabled={!canApprove}>
            <Icon name="spark"/> {working==="approve"?"Approbation en cours…":"Approuver la préparation"}
          </button>
          {approval && <div className="atlas-gh-studio-ok" role="status">
            <strong>Configuration approuvée</strong>
            {"Accord temporaire délivré pour ce dépôt uniquement. Aucune création encore effectuée."}
          </div>}
          {approval && preview.executionEnabled && <button type="button" className="atlas-gh-studio-submit"
            onClick={()=>void execute()} disabled={Boolean(working) || !consent || typedName!==preview.preview.name}>
            <Icon name="plus-circle"/> {working==="create"?"Création en cours…":"Créer ce dépôt sur GitHub"}
          </button>}
          {created && <p className="atlas-gh-studio-ok" role="status">
            {created.state==="succeeded"?"Dépôt créé et autorisé dans Atlas.":
              created.state==="reconciliation_required"?
                "GitHub peut avoir créé le dépôt. Confirmez son accès dans l’installation GitHub avant de continuer.":
                "Opération enregistrée. Vérifiez son statut avant une nouvelle tentative."}
          </p>}
          <p className="atlas-gh-studio-approval-footnote">
            {"L’accord serveur expire après cinq minutes et une création demande toujours un consentement explicite."}
          </p>
        </section>}
        {problem && <p className="atlas-gh-studio-caution" role="alert">{problem}</p>}
      </div>

      <aside className="atlas-gh-studio-preview" aria-live="polite">
        <div className="atlas-gh-studio-preview-top">
          <span className="atlas-gh-studio-kicker">APERÇU DU PROJET</span>
          <span className="atlas-gh-studio-preview-status">{approval?"Pré-approuvé":preview?"Vérifié":"Brouillon"}</span>
        </div>
        <div className="atlas-gh-studio-preview-symbol"><Icon name="layers"/></div>
        <span className="atlas-gh-studio-preview-label">REPOSITORY</span>
        <strong>{draft.name.trim()||"nouveau-depot"}</strong>
        <span className="atlas-gh-studio-preview-type"><Icon name={draft.private?"layers":"grid"}/>
          {draft.private?"Dépôt privé":"Dépôt public"}</span>
        <p>{draft.description||"Votre prochaine idée mérite un dépôt bien organisé."}</p>
        <div className="atlas-gh-studio-preview-facts">
          <span>Workspace <b>Atlas</b></span>
          <span>README <b>{draft.autoInit?"Inclus":"Non"}</b></span>
          <span>Contrôle GitHub <b>{permission==="granted"?"Write vérifié":permission==="missing"?"À réapprouver":"À vérifier"}</b></span>
          <span>Action réelle <b>{created?.state??"Aucune tentative"}</b></span>
        </div>
        <div className="atlas-gh-studio-preview-divider"/>
        <div className="atlas-gh-studio-unavailable">
          <Icon name="settings"/>
          <div><strong>{preview?.executionEnabled?"Création GitHub disponible après approbation":"Création non activée dans cet environnement"}</strong>
            <p>{preview?.executionEnabled ?
              "La création pourra être lancée après autorisation OAuth, vérification des droits et approbation explicite.":
              "Aucune tentative de création n’a été envoyée à GitHub. Cet environnement permet seulement la préparation."}</p>
          </div>
        </div>
        <span className="atlas-gh-studio-preview-footer"><Icon name="spark"/> PRÉPARATION SÉCURISÉE PAR ATLAS</span>
      </aside>
    </div>
  </section>;
}
