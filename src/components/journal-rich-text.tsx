import type { Block, Inline } from "../../packages/engines/mausbot/src/journal-reader.mjs";
import { parseBlocks } from "../../packages/engines/mausbot/src/journal-reader.mjs";

/** Safe renderer: parsed tokens become React elements; text is always escaped by React. */
function Inl({ parts }: { parts: Inline[] }) {
  return <>{parts.map((p, i) => p.t === "link"
    ? <a key={i} href={p.href} target="_blank" rel="noopener noreferrer nofollow">{p.v}</a>
    : p.t === "strong" ? <strong key={i}>{p.v}</strong> : p.t === "em" ? <em key={i}>{p.v}</em> : <span key={i}>{p.v}</span>)}</>;
}
function listItems(b: Block) {
  return "items" in b ? b.items.map((it: Inline[], j: number) => <li key={j}><Inl parts={it} /></li>) : null;
}
export function RichText({ text, className }: { text: string | null | undefined; className?: string }) {
  const blocks: Block[] = parseBlocks(text);
  if (!blocks.length) return null;
  return <div className={className}>{blocks.map((b, i) =>
    b.type === "p" ? <p key={i}><Inl parts={b.inline} /></p>
    : b.type === "quote" ? <blockquote key={i}><Inl parts={b.inline} /></blockquote>
    : b.type === "ul" ? <ul key={i}>{listItems(b)}</ul>
    : <ol key={i}>{listItems(b)}</ol>)}</div>;
}
