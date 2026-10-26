import { journalItemKey } from "./journal.mjs";

// Pure helpers for the journal reading view. Output is plain data rendered by React (no HTML strings).

const SAFE_URL = /^https?:\/\/[^\s<>"']+$/i;
export function safeLink(url) { return typeof url === "string" && SAFE_URL.test(url) && url.length <= 2048 ? url : null; }

/** Inline tokens: text, strong, em, link ([label](url) or bare https URL). Unknown markup stays literal text. */
export function parseInline(text) {
  const out = [];
  const re = /\[([^\]\n]{1,200})\]\((https?:\/\/[^\s)]{1,2048})\)|\*\*([^*\n]{1,400})\*\*|(?<![\w*])_([^_\n]{1,400})_(?!\w)|(https?:\/\/[^\s<>()"']{4,2048})/g;
  let last = 0, m;
  const s = typeof text === "string" ? text : "";
  while ((m = re.exec(s))) {
    if (m.index > last) out.push({ t: "text", v: s.slice(last, m.index) });
    if (m[1] !== undefined) { const href = safeLink(m[2]); out.push(href ? { t: "link", v: m[1], href } : { t: "text", v: m[0] }); }
    else if (m[3] !== undefined) out.push({ t: "strong", v: m[3] });
    else if (m[4] !== undefined) out.push({ t: "em", v: m[4] });
    else { const href = safeLink(m[5]); out.push(href ? { t: "link", v: new URL(href).hostname.replace(/^www\./, ""), href } : { t: "text", v: m[5] }); }
    last = re.lastIndex;
  }
  if (last < s.length) out.push({ t: "text", v: s.slice(last) });
  return out;
}

/** Block structure: paragraphs, bullet lists, ordered lists, quotes. Raw HTML is never interpreted. */
export function parseBlocks(text) {
  const lines = (typeof text === "string" ? text : "").replace(/\r\n?/g, "\n").split("\n");
  const blocks = [];
  let cur = null;
  const flush = () => { if (cur) blocks.push(cur); cur = null; };
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) { flush(); continue; }
    let m;
    if ((m = /^[-*•]\s+(.+)$/.exec(line))) { if (cur?.type !== "ul") { flush(); cur = { type: "ul", items: [] }; } cur.items.push(parseInline(m[1])); }
    else if ((m = /^\d{1,2}[.)]\s+(.+)$/.exec(line))) { if (cur?.type !== "ol") { flush(); cur = { type: "ol", items: [] }; } cur.items.push(parseInline(m[1])); }
    else if ((m = /^>\s?(.*)$/.exec(line))) { if (cur?.type !== "quote") { flush(); cur = { type: "quote", text: "" }; } cur.text += (cur.text ? " " : "") + m[1]; }
    else { if (cur?.type !== "p") { flush(); cur = { type: "p", text: "" }; } cur.text += (cur.text ? " " : "") + line; }
  }
  flush();
  return blocks.map(b => b.type === "p" || b.type === "quote" ? { type: b.type, inline: parseInline(b.text) } : b);
}

export function readingMinutes(...texts) {
  const words = texts.filter(t => typeof t === "string").join(" ").split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 220));
}

/** Featured ("à la une"): first item flagged featured, else the first item. */
export function pickFeatured(items) {
  if (!Array.isArray(items) || !items.length) return null;
  return items.find(i => i?.featured === true) ?? items[0];
}

export const FONT_STEPS = Object.freeze([16, 18, 20, 22, 24]);
export function stepFont(index, delta) { return Math.min(FONT_STEPS.length - 1, Math.max(0, (Number.isInteger(index) ? index : 1) + delta)); }
export const READER_THEMES = Object.freeze(["light", "sepia", "dark"]);

/** Horizontal swipe decision: returns +1 (next), -1 (previous) or 0. */
export function swipeDirection(dx, dy, { min = 60 } = {}) {
  if (Math.abs(dx) < min || Math.abs(dx) < Math.abs(dy) * 1.5) return 0;
  return dx < 0 ? 1 : -1;
}
export function neighbor(list, id, dir) {
  const i = list.findIndex(x => (x.key ?? x.id) === id);
  if (i < 0) return null;
  return list[i + dir] ?? null;
}
/** Items of a theme that "Tout marquer terminé" would change, with their previous state for undo. */
export function bulkDonePlan(items, category) {
  return items.filter(i => (category === "all" || i.category === category) && i.state !== "done")
    .map(i => ({ key: i.key ?? journalItemKey(i.editionId, i.id), id: i.id, editionId: i.editionId, previous: i.state }));
}
