import { UiBuilderPreview } from '@/components/ui-builder-preview';
import { BASE_COMPOSITION, parseComposition } from '@/lib/ui-studio/builder';

export default async function UiStudioPage({ searchParams }: { searchParams: Promise<{ composition?: string | string[] }> }) {
  const params = await searchParams;
  let initial = BASE_COMPOSITION;
  try {
    if (params.composition !== undefined) {
      if (typeof params.composition !== 'string' || params.composition.length > 4096) throw new Error('Invalid composition');
      initial = parseComposition(JSON.parse(params.composition));
    }
  } catch {
    return <main><h1>Composition refusée</h1><p>Le catalogue autorisé et ses contraintes doivent être respectés.</p></main>;
  }
  return <UiBuilderPreview key={JSON.stringify(initial)} initial={initial}/>;
}
