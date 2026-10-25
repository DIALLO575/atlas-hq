export type UiConfig = Readonly<{ schemaVersion: 1; density: 'comfortable' | 'compact'; accent: 'blue' | 'green' }>;
export const DEFAULT_CONFIG: UiConfig = Object.freeze({ schemaVersion: 1, density: 'comfortable', accent: 'blue' });
export function parseConfig(value: unknown): UiConfig {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Configuration invalide');
  const input = value as Record<string, unknown>;
  if (Object.keys(input).length !== 3 || !Object.hasOwn(input, 'schemaVersion') || !Object.hasOwn(input, 'density') || !Object.hasOwn(input, 'accent') || input.schemaVersion !== 1 || !['comfortable', 'compact'].includes(input.density as string) || !['blue', 'green'].includes(input.accent as string)) throw new Error('Réglage non autorisé');
  return Object.freeze({ schemaVersion: 1, density: input.density as UiConfig['density'], accent: input.accent as UiConfig['accent'] });
}
export type DraftVersion = Readonly<{ id: number; config: UiConfig }>;
export function saveVersion(versions: readonly DraftVersion[], value: unknown): readonly DraftVersion[] {
  const config = parseConfig(value);
  if (versions.length >= 50) throw new Error('Limite de 50 versions atteinte');
  return [...versions, { id: (versions.at(-1)?.id ?? 0) + 1, config }];
}
export function restoreVersion(versions: readonly DraftVersion[], id: number): UiConfig {
  const version = versions.find((entry) => entry.id === id);
  if (!version) throw new Error('Version introuvable');
  return parseConfig(version.config);
}
