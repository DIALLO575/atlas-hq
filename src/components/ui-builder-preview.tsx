'use client';
import { useState } from 'react';
import { PageHeading, EmptyPanel } from '@/components/page-elements';
import { BASE_COMPOSITION, parseComposition, compositionDiff, type Composition } from '@/lib/ui-studio/builder';

function CompositionPreview({ composition }: { composition: Composition }) {
  return <>{parseComposition(composition).blocks.map((block) => block.component === 'PageHeading'
    ? <PageHeading key={block.id} eyebrow={block.props.eyebrow} title={block.props.title} description={block.props.description}/>
    : <EmptyPanel key={block.id} title="Aucun contenu connecté">Ce panneau ne lit aucune donnée métier.</EmptyPanel>)}</>;
}
export function UiBuilderPreview({ initial }: { initial: Composition }) {
  const [versions, setVersions] = useState<Composition[]>(() => [parseComposition(BASE_COMPOSITION), parseComposition(initial)]);
  const current = versions[versions.length - 1];
  return <main style={{ maxWidth: 1100, margin: 'auto', padding: 24 }}>
    <h1>Atlas UI Builder — inspection de proposition agent</h1>
    <p>Composition structurée produite via outil. Données fictives ; aucune activation. Historique temporaire de cet onglet, effacé au rechargement.</p>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 24 }}>
      <section aria-label="Référence du POC"><h2>Référence du POC</h2><CompositionPreview composition={BASE_COMPOSITION}/></section>
      <section aria-label="Proposition agent"><h2>Proposition agent</h2><CompositionPreview composition={current}/></section>
    </div>
    <h2>Diff structuré</h2><pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{JSON.stringify(compositionDiff(BASE_COMPOSITION, current), null, 2)}</pre>
    <h2>Versions temporaires</h2>
    <ul>{versions.map((version, index) => <li key={index}>Version {index}{' '}<button disabled={versions.length >= 50} onClick={() => setVersions((previous) => [...previous, parseComposition(version)])}>Restaurer la version {index}</button></li>)}</ul>
    <p>Ce POC expose un outil CLI ; aucun agent LLM ni connecteur MausBot intégré à cette page. Aucun réglage manuel des composants. Les nouveaux composants suivent une branche/PR.</p>
  </main>;
}
