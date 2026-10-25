// Cover image resolution for journal items. Server-only. SSRF-safe og:image lookup.
import { lookup as dnsLookup } from "node:dns/promises";
import { isIP } from "node:net";
import { safeHttpUrl } from "./journal.mjs";

export class JournalFetchError extends Error {
  constructor(code) { super(code); this.name = "JournalFetchError"; this.code = code; }
}
/** True for loopback, private, link-local, CGNAT, multicast, reserved and mapped ranges. */
export function isPrivateAddress(address) {
  const kind = isIP(address);
  if (kind === 4) {
    const [a, b] = address.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) ||
      (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19));
  }
  if (kind === 6) {
    const v = address.toLowerCase().replace(/^\[|\]$/g, "");
    if (v === "::" || v === "::1") return true;
    const mapped = v.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateAddress(mapped[1]);
    if (/^::ffff:/.test(v)) return true;
    return /^(fc|fd|fe8|fe9|fea|feb|ff)/.test(v) || v.startsWith("64:ff9b") || v.startsWith("2001:db8");
  }
  return true;
}
/** Validates a URL and every address its host resolves to. Throws JournalFetchError. */
export async function assertPublicUrl(raw, { lookup = dnsLookup } = {}) {
  const url = safeHttpUrl(raw);
  if (!url) throw new JournalFetchError("URL_REFUSED");
  const u = new URL(url);
  if (u.port && !["80", "443"].includes(u.port)) throw new JournalFetchError("URL_REFUSED");
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal") || host.endsWith(".local"))
    throw new JournalFetchError("URL_PRIVATE");
  const addrs = isIP(host) ? [{ address: host }] : await lookup(host, { all: true, verbatim: true }).catch(() => { throw new JournalFetchError("DNS_FAILED"); });
  if (!addrs.length || addrs.some(a => isPrivateAddress(a.address))) throw new JournalFetchError("URL_PRIVATE");
  return u;
}
async function readCapped(response, maxBytes) {
  const len = Number(response.headers.get("content-length") ?? 0);
  if (len > maxBytes) throw new JournalFetchError("TOO_LARGE");
  const reader = response.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks = []; let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) { await reader.cancel().catch(() => {}); throw new JournalFetchError("TOO_LARGE"); }
    chunks.push(value);
  }
  const out = new Uint8Array(total); let o = 0;
  for (const c of chunks) { out.set(c, o); o += c.byteLength; }
  return out;
}
/** GET with manual redirects (each hop re-validated), timeout and size cap. */
export async function safeFetch(raw, { fetchImpl = fetch, lookup, timeoutMs = 4000, maxBytes = 1_000_000, accept = "*/*", maxRedirects = 3 } = {}) {
  let current = raw;
  const signal = AbortSignal.timeout(timeoutMs);
  for (let hop = 0; hop <= maxRedirects; hop++) {
    const u = await assertPublicUrl(current, { lookup });
    let response;
    try {
      response = await fetchImpl(u.toString(), { method: "GET", redirect: "manual", signal, headers: { Accept: accept, "User-Agent": "ATLAS-HQ-Journal/1.0" } });
    } catch { throw new JournalFetchError("FETCH_FAILED"); }
    if (response.status >= 300 && response.status < 400) {
      const loc = response.headers.get("location");
      if (!loc) throw new JournalFetchError("FETCH_FAILED");
      current = new URL(loc, u).toString();
      continue;
    }
    if (!response.ok) throw new JournalFetchError("FETCH_FAILED");
    return { response, url: u.toString(), body: await readCapped(response, maxBytes) };
  }
  throw new JournalFetchError("TOO_MANY_REDIRECTS");
}
/** Extracts og:image / twitter:image from HTML (absolute http(s) only). */
export function extractOgImage(html, baseUrl) {
  const metas = String(html).slice(0, 500_000).match(/<meta\b[^>]*>/gi) ?? [];
  for (const key of ["og:image:secure_url", "og:image", "twitter:image"]) {
    for (const tag of metas) {
      const prop = tag.match(/\b(?:property|name)\s*=\s*["']([^"']+)["']/i)?.[1]?.toLowerCase();
      if (prop !== key) continue;
      const content = tag.match(/\bcontent\s*=\s*["']([^"']+)["']/i)?.[1];
      if (!content) continue;
      try { const abs = safeHttpUrl(new URL(content.replace(/&amp;/g, "&"), baseUrl).toString()); if (abs) return abs; } catch { /* skip */ }
    }
  }
  return null;
}
/** Verifies a candidate URL really serves an image (content-type image/*, capped size). */
export async function verifyImage(url, deps = {}) {
  const { response } = await safeFetch(url, { ...deps, accept: "image/*", maxBytes: deps.maxImageBytes ?? 5_000_000 });
  const type = (response.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  if (!/^image\/(jpeg|png|webp|gif|avif)$/.test(type)) throw new JournalFetchError("NOT_IMAGE");
  return { url, contentType: type };
}
/**
 * Image provider interface: { name, generate({ title, category, summary }) => Promise<{ url } | null> }.
 * ATLAS has no image generator configured today, so the default stub returns null and the UI
 * falls back to a themed typographic cover marked "illustration générée". Never hard-code keys.
 */
export const stubImageProvider = Object.freeze({ name: "stub", async generate() { return null; } });

/** Resolve cover: provided image_url → og:image of source → generated illustration → themed placeholder. */
export async function resolveCover(item, { provider = stubImageProvider, ...deps } = {}) {
  if (item.imageUrl) {
    try { await verifyImage(item.imageUrl, deps); return { url: item.imageUrl, generated: false, origin: "provided" }; } catch { /* fall through */ }
  }
  if (item.sourceUrl) {
    try {
      const { response, body, url } = await safeFetch(item.sourceUrl, { ...deps, accept: "text/html", maxBytes: 1_000_000 });
      if (/text\/html|application\/xhtml/.test(response.headers.get("content-type") ?? "")) {
        const og = extractOgImage(new TextDecoder().decode(body), url);
        if (og) { await verifyImage(og, deps); return { url: og, generated: false, origin: "og" }; }
      }
    } catch { /* fall through */ }
  }
  try {
    const out = await provider.generate({ title: item.title, category: item.category, summary: item.summary });
    if (out?.url && safeHttpUrl(out.url)) return { url: out.url, generated: true, origin: "generated" };
  } catch { /* fall through */ }
  return { url: null, generated: true, origin: "placeholder" };
}
