"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Icon } from "@/components/icon";

type Draft = {
  name: string;
  description: string;
  private: boolean;
  autoInit: boolean;
};
type PreviewResult = {
  preview: Draft;
  canExecute: false;
  nextStep: string;
};
const errors: Record<string, string> = {
  INVALID_REQUEST: "Vérifiez le nom du dépôt et les valeurs saisies.",
  INVALID_INPUT: "Nom de dépôt invalide. Utilisez des lettres, chiffres, points, tirets et underscores.",
  AUTH_REQUIRED: "Votre session Atlas a expiré. Reconnectez-vous.",
  AUTH_UNAVAILABLE: "Le service d'authentification est indisponible.",
  WORKSPACE_FORBIDDEN: "Il faut être propriétaire ou administrateur du workspace.",
  WORKSPACE_UNAVAILABLE: "Les droits du workspace ne peuvent pas être vérifiés.",
  GITHUB_NOT_AUTHORIZED: "Installation GitHub non autorisée pour ce workspace.",
  CONNECTIONS_UNAVAILABLE: "La connexion GitHub n'est pas disponible actuellement.",
  STUDIO_NOT_CONFIGURED: "La prévisualisation Studio n'est pas configurée sur cet environnement.",
  FORBIDDEN_ORIGIN: "Cette demande doit provenir du site Atlas officiel.",
};

export function GitHubStudioRepositoryWizard({ workspaceId, installationId, canManage, ready }: {
  workspaceId: string;
  installationId: number | null;
  canManage: boolean;
  ready: boolean;
}) {
  const [draft, setDraft] = useState<Draft>({ name: "", description: "", private: true, autoInit: true });
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const pending = useRef<AbortController | null>(null);

  useEffect(() => () => pending.current?.abort(), []);
  const permitted = canManage && ready && installationId !== null;

  function change(next: Partial<Draft>) {
    pending.current?.abort();
    setWorking(false);
    setDraft((current) => ({ ...current, ...next }));
    setPreview(null);
    setError(null);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!permitted || working) return;
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    setWorking(true);
    setError(null);
    setPreview(null);
    try {
      const response = await fetch("/api/apps/github/studio/repositories/preview", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...draft, workspaceId, installationId }),
        signal: controller.signal,
      });
      const data = await response.json();
      if (controller.signal.aborted) return;
      if (!response.ok) {
        setError(errors[String(data?.error)] ?? "Impossible de vérifier cette configuration.");
        return;
      }
      if (data?.canExecute !== false || !data?.preview) {
        setError("La réponse du serveur est inattendue.");
        return;
      }
      setPreview(data as PreviewResult);
    } catch {
      if (!controller.signal.aborted) setError("Impossible de contacter Atlas. Réessayez.");
    } finally {
      if (!controller.signal.aborted) setWorking(false);
    }
  }

  return <section className="atlas-gh-studio" aria-label="GitHub Repository Studio">
    <header className="atlas-gh-studio-head">
      <div>
        <p className="atlas-gh-studio-kicker">GITHUB STUDIO / DÉPÔTS</p>
        <h2>Préparer un nouveau dépôt</h2>
        <p>Configurez votre futur dépôt, puis vérifiez la demande avec votre workspace Atlas.</p>
      </div>
      <span className="atlas-gh-studio-state">Prévisualisation uniquement</span>
    </header>
    <div className="atlas-gh-studio-layout">
      <form className="atlas-gh-studio-form" onSubmit={(event) => void submit(event)}>
        <label>Nom du dépôt
          <input name="repositoryName" value={draft.name} required maxLength={100}
            pattern="[A-Za-z0-9_.-]+" placeholder="mon-nouveau-projet"
            autoComplete="off" onChange={(event) => change({ name: event.target.value })}/>
        </label>
        <label>Description
          <textarea name="description" value={draft.description} maxLength={350} rows={3}
            placeholder="Que va contenir ce dépôt ?"
            onChange={(event) => change({ description: event.target.value })}/>
        </label>
        <fieldset className="atlas-gh-studio-visibility">
          <legend>Visibilité</legend>
          <label><input type="radio" name="visibility" checked={draft.private}
            onChange={() => change({ private: true })}/> Privé
            <small>Accessible uniquement aux personnes autorisées.</small></label>
          <label><input type="radio" name="visibility" checked={!draft.private}
            onChange={() => change({ private: false })}/> Public
            <small>Visible sur GitHub par tout le monde.</small></label>
        </fieldset>
        <label className="atlas-gh-studio-check"><input type="checkbox" checked={draft.autoInit}
          onChange={(event) => change({ autoInit: event.target.checked })}/> Initialiser avec un README</label>
        {!canManage && <p className="atlas-gh-studio-caution" role="status">
          Seuls les propriétaires et administrateurs du workspace peuvent préparer un dépôt.
        </p>}
        {canManage && !ready && <p className="atlas-gh-studio-caution" role="status">
          Connectez et vérifiez une installation GitHub avant de prévisualiser.
        </p>}
        <button className="atlas-gh-primary-action" type="submit" disabled={!permitted || working}>
          <Icon name="spark"/> {working ? "Vérification…" : "Vérifier la configuration"}
        </button>
      </form>
      <aside className="atlas-gh-studio-preview" aria-live="polite">
        <span className="atlas-gh-studio-kicker">VOTRE PROJET</span>
        <div className="atlas-gh-studio-preview-symbol"><Icon name="layers"/></div>
        <strong>{draft.name.trim() || "nouveau-depot"}</strong>
        <span className="atlas-gh-studio-preview-type">{draft.private ? "Dépôt privé" : "Dépôt public"}</span>
        <p>{draft.description || "Ajoutez une description pour présenter votre projet."}</p>
        <div className="atlas-gh-studio-preview-facts">
          <span>Workspace <b>actuel</b></span>
          <span>Initialisation <b>{draft.autoInit ? "README" : "Aucune"}</b></span>
          <span>GitHub <b>{preview ? "Demande vérifiée côté Atlas" : "Non vérifié"}</b></span>
        </div>
        {preview && <div className="atlas-gh-studio-ok" role="status">
          {"Les champs, vos droits Workspace et l'installation enregistrée ont été vérifiés par Atlas."}
          <strong>{"Le dépôt n'a pas été créé."}</strong>
        </div>}
        {error && <p className="atlas-gh-studio-caution" role="alert">{error}</p>}
        <div className="atlas-gh-studio-unavailable">
          <Icon name="settings"/>
          <div><strong>Création GitHub désactivée</strong>
          <p>{"En attente des autorisations GitHub App, de l'audit durable et des tests sandbox."}</p></div>
        </div>
      </aside>
    </div>
  </section>;
}
