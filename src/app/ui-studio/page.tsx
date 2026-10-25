'use client';

import { useState } from 'react';
import { DEFAULT_CONFIG, parseConfig, restoreVersion, saveVersion, type UiConfig, type DraftVersion } from '../../lib/ui-studio/config';

function MissionsPreview({ config, label }: { config: UiConfig; label: string }) {
  return <section aria-label={label} style={{ background: '#101827', color: '#f1f5f9', padding: 20, borderRadius: 12 }}>
    <h2>{label}</h2><h3>Missions — données de démonstration</h3>
    {['Préparer le lancement', 'Relire la documentation', 'Valider la maquette'].map((title) =>
      <article key={title} style={{ padding: config.density === 'compact' ? 8 : 24, marginBottom: 8, borderLeft: `4px solid ${config.accent === 'blue' ? '#60a5fa' : '#4ade80'}`, background: '#1e293b' }}>{title}</article>)}
  </section>;
}

export default function UiStudioPage() {
  const [draft, setDraft] = useState<UiConfig>(DEFAULT_CONFIG);
  const [versions, setVersions] = useState<readonly DraftVersion[]>([]);
  const [message, setMessage] = useState('');
  function update(patch: Partial<UiConfig>) { setDraft(parseConfig({ ...draft, ...patch })); }
  return <main style={{ maxWidth: 1100, margin: 'auto', padding: 24 }}>
    <h1>Atlas UI Studio — POC Missions</h1>
    <p>Aperçu privé de démonstration. Les brouillons restent en mémoire dans cet onglet et sont effacés au rechargement. Aucun réglage actif du workspace n’est modifié.</p>
    <fieldset><legend>Réglages autorisés</legend>
      <label>Densité <select value={draft.density} onChange={(event) => update({ density: event.target.value as UiConfig['density'] })}><option value="comfortable">Confortable</option><option value="compact">Compacte</option></select></label>{' '}
      <label>Accent <select value={draft.accent} onChange={(event) => update({ accent: event.target.value as UiConfig['accent'] })}><option value="blue">Bleu</option><option value="green">Vert</option></select></label>{' '}
      <button disabled={versions.length >= 50} onClick={() => { setVersions(saveVersion(versions, draft)); setMessage('Brouillon enregistré dans cet onglet.'); }}>Enregistrer une version du brouillon</button>{' '}
      <button onClick={() => { setDraft(DEFAULT_CONFIG); setMessage('Réglages de référence restaurés dans l’aperçu.'); }}>Restaurer la référence</button>
    </fieldset>
    <p role="status">{message}</p>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
      <MissionsPreview config={DEFAULT_CONFIG} label="Référence du POC"/><MissionsPreview config={draft} label="Aperçu du brouillon"/>
    </div>
    <h2>Configuration du brouillon</h2><pre>{JSON.stringify(draft, null, 2)}</pre>
    <h2>Versions de cet onglet</h2>
    <ul>{versions.map((version) => <li key={version.id}>Version {version.id} — {version.config.density}, {version.config.accent}{' '}<button onClick={() => { setDraft(restoreVersion(versions, version.id)); setMessage(`Version ${version.id} restaurée dans l’aperçu.`); }}>Restaurer la version {version.id}</button></li>)}</ul>
    <p>Pour une nouvelle structure ou un nouveau comportement : parcours agent-code sur branche séparée avec revue. L’activation et la persistance par workspace restent à implémenter côté serveur.</p>
  </main>;
}
