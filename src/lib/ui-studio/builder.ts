export type Block =
  | { id: string; component: 'PageHeading'; props: { eyebrow: string; title: string; description: string } }
  | { id: string; component: 'DemoNotice'; props: Record<string, never> };
export type BuilderCommand =
  | { operation: 'catalog' }
  | { operation: 'compose'; expectedVersion: number; composition: Composition }
  | { operation: 'restore'; expectedVersion: number; version: number };
function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}
export type Composition = { schemaVersion: 1; page: 'missions'; blocks: Block[] };
export const CATALOG = deepFreeze({
  schemaVersion: 1, page: 'missions', maxBlocks: 2,
  components: [
    { name: 'PageHeading', source: 'src/components/page-elements.tsx', description: 'Titre et introduction Atlas', props: { eyebrow: 'text 1..160', title: 'text 1..160', description: 'text 1..160' }, required: true, position: 0 },
    { name: 'DemoNotice', source: 'src/components/page-elements.tsx', description: 'Avertissement Atlas sur les données fictives', props: {}, required: false, position: 1 },
  ],
  operations: ['catalog', 'compose', 'restore'],
  constraints: ['demo data only', 'exactly one heading first', 'at most one demo notice', 'no HTML, code, URLs, data bindings or actions', 'no activation or shared storage'],
});
export const BASE_COMPOSITION: Composition = deepFreeze<Composition>({ schemaVersion: 1, page: 'missions', blocks: [
  { id: 'heading', component: 'PageHeading', props: { eyebrow: 'ATLAS', title: 'Missions', description: 'Aperçu de composition sur données fictives.' } },
] });
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new Error('Expected object');
  return value as Record<string, unknown>;
}
function exact(value: Record<string, unknown>, keys: string[]) {
  if (Reflect.ownKeys(value).length !== keys.length || keys.some((key) => !Object.hasOwn(value, key))) throw new Error('Unsupported fields');
}
export function parseComposition(value: unknown): Composition {
  const input = record(value); exact(input, ['schemaVersion', 'page', 'blocks']);
  if (input.schemaVersion !== 1 || input.page !== 'missions' || !Array.isArray(input.blocks) || input.blocks.length < 1 || input.blocks.length > 2) throw new Error('Unsupported page or composition');
  const ids = new Set<string>();
  const blocks = Array.from(input.blocks,(raw: unknown, index: number): Block => {
    const block = record(raw); exact(block, ['id', 'component', 'props']);
    if (typeof block.id !== 'string' || !/^[a-z][a-z0-9-]{0,31}$/.test(block.id) || ids.has(block.id)) throw new Error('Invalid block id');
    ids.add(block.id);
    const component = index === 0 ? 'PageHeading' : 'DemoNotice';
    if (block.component !== component) throw new Error('Unsupported component or position');
    const props = record(block.props); exact(props, index === 0 ? ['eyebrow', 'title', 'description'] : []);
    const clean: Record<string, string> = {};
    for (const key of index === 0 ? ['eyebrow', 'title', 'description'] : []) {
      const value = props[key];
      if (typeof value !== 'string' || !value.trim() || value.length > 160 || /[<>\u0000-\u001f]|https?:\/\//i.test(value)) throw new Error('Plain bounded text required');
      clean[key] = value;
    }
    return component === 'PageHeading'
      ? { id: block.id, component, props: { eyebrow: clean.eyebrow, title: clean.title, description: clean.description } }
      : { id: block.id, component, props: {} };
  });
  return { schemaVersion: 1, page: 'missions', blocks };
}
export function compositionDiff(before: Composition, after: Composition) {
  const old = parseComposition(before), next = parseComposition(after);
  return {
    added: next.blocks.filter((b) => !old.blocks.some((a) => a.id === b.id)),
    removed: old.blocks.filter((a) => !next.blocks.some((b) => b.id === a.id)),
    changed: next.blocks.filter((b) => old.blocks.some((a) => a.id === b.id && JSON.stringify(a) !== JSON.stringify(b))),
  };
}
export function createBuilder() {
  const versions: Composition[] = [parseComposition(BASE_COMPOSITION)];
  return { call(value: unknown) {
    const input = record(value);
    if (input.operation === 'catalog') { exact(input, ['operation']); return { catalog: structuredClone(CATALOG) }; }
    let composition: Composition;
    if (input.operation === 'compose') {
      exact(input, ['operation', 'expectedVersion', 'composition']);
      composition = parseComposition(input.composition);
    } else if (input.operation === 'restore') {
      exact(input, ['operation', 'expectedVersion', 'version']);
      if (!Number.isInteger(input.version) || typeof input.version !== 'number' || !versions[input.version]) throw new Error('Unknown version');
      composition = parseComposition(versions[input.version]);
    } else throw new Error('Unknown operation');
    if (input.expectedVersion !== versions.length - 1) throw new Error('Stale version');
    if (versions.length >= 50) throw new Error('Version limit');
    const diff = compositionDiff(versions.at(-1)!, composition);
    versions.push(composition);
    return { version: versions.length - 1, composition: structuredClone(composition), diff: structuredClone(diff),
      previewPath: `/ui-studio?composition=${encodeURIComponent(JSON.stringify(composition))}` };
  } };
}
