"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/icon";
import { listWorkspaces } from "@/app/workspaces/actions";
import { RichText } from "@/components/journal-rich-text";
import { FONT_STEPS, READER_THEMES, bulkDonePlan, neighbor, pickFeatured, readingMinutes, stepFont, swipeDirection } from "../../packages/engines/mausbot/src/journal-reader.mjs";

type Category = "ia" | "commerce" | "guinee" | "afrique" | "monde" | "economie";
type ReadState = "new" | "read" | "done";
type Item = {
  id: string; editionId: string; category: Category; title: string; summary: string; whyItMatters: string | null;
  certainty: "elevee" | "moyenne" | "faible" | null; status: "confirme" | "rapporte" | "a_verifier" | null;
  sourceUrl: string | null; sourceName: string | null; extraSources: { url: string; name: string | null }[];
  publishedAt: string | null; authorBot: string | null; state: ReadState; featured?: boolean;
  cover: { storagePath: string; generated: boolean; alt: string; credit: string | null; sourceName: string | null } | null; coverUrl: string | null;
};
type Payload = { source: "supabase-read-only"; producer: string; demo: boolean; editionId: string; generatedAt: string | null; offline?: boolean;
  categories: { id: Category; label: string; count: number }[]; items: Item[]; stateAvailable: boolean };
type View = { status: "loading" | "ready" | "offline" | "error"; data?: Payload; error?: string };
type Theme = (typeof READER_THEMES)[number];
type Undo = { label: string; plan: { id: string; editionId: string; previous: "new" | "read" }[] } | null;

const CERTAINTY: Record<string, string> = { elevee: "Certitude élevée", moyenne: "Certitude moyenne", faible: "Certitude faible" };
const STATUS: Record<string, string> = { confirme: "Confirmé", rapporte: "Rapporté", a_verifier: "À vérifier" };
const THEME_LABEL: Record<Theme, string> = { light: "Clair", sepia: "Sépia", dark: "Sombre" };
function errorText(code?: string) {
  if (code === "OFFLINE") return "Hors ligne et aucune édition enregistrée sur cet appareil.";
  if (code === "JOURNAL_SOURCE_UNAVAILABLE") return "Tables du journal indisponibles (migrations non appliquées ou Supabase injoignable).";
  if (code === "JOURNAL_OWNER_REQUIRED" || code === "ENGINE_WRITE_FORBIDDEN" || code === "WORKSPACE_FORBIDDEN") return "Le journal est réservé au propriétaire du workspace.";
  if (code === "AUTH_REQUIRED") return "Connectez-vous pour lire le journal.";
  if (code === "JOURNAL_EDITION_NOT_FOUND") return "Aucune édition disponible pour l’instant.";
  return "Journal indisponible. Aucun contenu n’est supposé.";
}
function dateLabel(v: string | null, opts: Intl.DateTimeFormatOptions = { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }) {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : new Intl.DateTimeFormat("fr-FR", opts).format(d);
}
function usePref<T extends string | number>(key: string, initial: T): [T, (v: T) => void] {
  // The reader is only mounted client-side after a tap, so reading localStorage in the initializer is safe.
  const [v, setV] = useState<T>(() => {
    try { const s = typeof window === "undefined" ? null : localStorage.getItem(key); if (s !== null) return (typeof initial === "number" ? Number(s) : s) as T; } catch {}
    return initial;
  });
  return [v, (n: T) => { setV(n); try { localStorage.setItem(key, String(n)); } catch {} }];
}

function Cover({ item, large, label }: { item: Item; large?: boolean; label?: string }) {
  const [failed, setFailed] = useState(false);
  const src = item.coverUrl && !failed ? item.coverUrl : null;
  return <figure className={"mj-cover is-" + item.category + (large ? " is-large" : "")}>
    {src
      // eslint-disable-next-line @next/next/no-img-element
      ? <img src={src} alt={item.cover?.alt ?? ""} loading={large ? "eager" : "lazy"} decoding="async" onError={() => setFailed(true)} />
      : <span className="mj-cover-fallback" aria-hidden><b>{label}</b></span>}
    {src && item.cover?.generated && <figcaption className="mj-generated">Illustration générée</figcaption>}
    {src && item.cover && !item.cover.generated && (item.cover.credit || item.cover.sourceName) && <figcaption className="mj-credit">{[item.cover.credit, item.cover.sourceName].filter(Boolean).join(" · ")}</figcaption>}
  </figure>;
}
function Badges({ item }: { item: Item }) {
  return <div className="mj-badges">
    {item.certainty && <span className={"mj-badge is-" + item.certainty}>{CERTAINTY[item.certainty]}</span>}
    {item.status && <span className={"mj-badge is-status-" + item.status}>{STATUS[item.status]}</span>}
    {item.state === "done" && <span className="mj-badge is-done">Terminé</span>}
  </div>;
}
function sourcesOf(item: Item) { return [...(item.sourceUrl ? [{ url: item.sourceUrl, name: item.sourceName }] : []), ...item.extraSources]; }

function Reader({ item, list, label, onClose, onNav, onState }: {
  item: Item; list: Item[]; label: (c: Category) => string; onClose: () => void; onNav: (i: Item) => void; onState: (i: Item, s: ReadState) => void;
}) {
  const [size, setSize] = usePref<number>("mj.font", 1);
  const [theme, setTheme] = usePref<Theme>("mj.theme", "light");
  const [progress, setProgress] = useState(0);
  const scroller = useRef<HTMLDivElement>(null);
  const closeBtn = useRef<HTMLButtonElement>(null);
  const touch = useRef<{ x: number; y: number } | null>(null);
  const prev = neighbor(list, item.id, -1), next = neighbor(list, item.id, 1);
  const minutes = readingMinutes(item.title, item.summary, item.whyItMatters);
  const sources = sourcesOf(item);

  useEffect(() => { scroller.current?.scrollTo({ top: 0 }); closeBtn.current?.focus(); }, [item.id]);
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; opener?.focus?.(); };
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight" && next) onNav(next);
      else if (e.key === "ArrowLeft" && prev) onNav(prev);
      else if (e.key === "Tab" && scroller.current) {
        const f = scroller.current.querySelectorAll<HTMLElement>("button,a[href],[tabindex]:not([tabindex='-1'])");
        if (!f.length) return;
        if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
        else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, onNav, next, prev]);

  return <div className={"mj-reader is-theme-" + theme} role="dialog" aria-modal="true" aria-labelledby="mj-reader-title"
    style={{ ["--mj-font" as string]: FONT_STEPS[size] + "px" }}>
    <div className="mj-reader-progress" role="progressbar" aria-label="Progression de lecture" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress)}><span style={{ width: progress + "%" }} /></div>
    <div className="mj-reader-bar">
      <button ref={closeBtn} className="mj-icon-btn" onClick={onClose} aria-label="Fermer la lecture"><Icon name="close" /></button>
      <span className="mj-reader-grip" aria-hidden />
      <div className="mj-reader-tools" role="group" aria-label="Réglages de lecture">
        <button className="mj-icon-btn" onClick={() => setSize(stepFont(size, -1))} disabled={size === 0} aria-label="Réduire le texte">A−</button>
        <button className="mj-icon-btn" onClick={() => setSize(stepFont(size, 1))} disabled={size === FONT_STEPS.length - 1} aria-label="Agrandir le texte">A+</button>
        <button className="mj-icon-btn mj-theme-btn" onClick={() => setTheme(READER_THEMES[(READER_THEMES.indexOf(theme) + 1) % READER_THEMES.length])}
          aria-label={"Mode de lecture : " + THEME_LABEL[theme] + ". Changer"}>{THEME_LABEL[theme]}</button>
      </div>
    </div>
    <div className="mj-reader-scroll" ref={scroller}
      onScroll={e => { const el = e.currentTarget; const max = el.scrollHeight - el.clientHeight; setProgress(max > 0 ? Math.min(100, 100 * el.scrollTop / max) : 100); }}
      onTouchStart={e => { touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }; }}
      onTouchEnd={e => { const t = touch.current; touch.current = null; if (!t) return;
        const d = swipeDirection(e.changedTouches[0].clientX - t.x, e.changedTouches[0].clientY - t.y);
        if (d === 1 && next) onNav(next); else if (d === -1 && prev) onNav(prev); }}>
      <article className="mj-article">
        <Cover item={item} large label={label(item.category)} />
        <p className={"mj-cat is-" + item.category}>{label(item.category)}{item.authorBot && <span className="mj-byline"> · par {item.authorBot}</span>}</p>
        <h1 id="mj-reader-title" className="mj-article-title">{item.title}</h1>
        <p className="mj-article-meta">{minutes} min de lecture{item.publishedAt && " · " + dateLabel(item.publishedAt, { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })}</p>
        <Badges item={item} />
        <RichText className="mj-prose mj-lede" text={item.summary} />
        {item.whyItMatters && <aside className="mj-why" aria-label="Pourquoi c’est important"><h2>Pourquoi c’est important</h2><RichText className="mj-prose" text={item.whyItMatters} /></aside>}
        <footer className="mj-article-sources">
          <h2>Source{sources.length > 1 ? "s" : ""}</h2>
          {sources.length ? <ul>{sources.map((s, i) => <li key={s.url + i}><a href={s.url} target="_blank" rel="noopener noreferrer nofollow">
            <strong>{s.name ?? "Lien"}</strong><span>{(() => { try { return new URL(s.url).hostname.replace(/^www\./, ""); } catch { return ""; } })()}</span><Icon name="arrow-up-right" /></a></li>)}</ul>
            : <p className="is-missing">Source non fournie</p>}
        </footer>
        <div className="mj-article-actions">
          {item.state !== "done" ? <button className="mj-primary" onClick={() => { onState(item, "done"); if (next) onNav(next); else onClose(); }}>Marquer terminé{next ? " · suivant" : ""}</button>
            : <button onClick={() => onState(item, "read")}>Rouvrir</button>}
        </div>
        <nav className="mj-article-nav" aria-label="Articles">
          <button disabled={!prev} onClick={() => prev && onNav(prev)}><Icon name="chevron-left" /><span><small>Précédent</small>{prev?.title ?? "—"}</span></button>
          <button disabled={!next} onClick={() => next && onNav(next)}><span><small>Suivant</small>{next?.title ?? "—"}</span><Icon name="chevron-right" /></button>
        </nav>
      </article>
    </div>
  </div>;
}

function IosInstallHint() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone;
    let dismissed = false; try { dismissed = localStorage.getItem("mj.iosHint") === "1"; } catch {}
    const t = setTimeout(() => setShow(Boolean(ios && !standalone && !dismissed)), 0);
    return () => clearTimeout(t);
  }, []);
  if (!show) return null;
  return <div className="mj-install" role="note"><span>Installer le journal : touchez <b>Partager</b> puis <b>Sur l’écran d’accueil</b>.</span>
    <button className="mj-icon-btn" aria-label="Masquer" onClick={() => { setShow(false); try { localStorage.setItem("mj.iosHint", "1"); } catch {} }}><Icon name="close" /></button></div>;
}

export function MorningJournal({ workspaceId }: { workspaceId?: string }) {
  const [ws, setWs] = useState(workspaceId ?? "");
  const [view, setView] = useState<View>({ status: "loading" });
  const [filter, setFilter] = useState<Category | "all">("all");
  const [readingId, setReadingId] = useState<string | null>(null);
  const [hideDone, setHideDone] = useState(false);
  const [online, setOnline] = useState(true);
  const [confirm, setConfirm] = useState(false);
  const [undo, setUndo] = useState<Undo>(null);
  const [pull, setPull] = useState(0);
  const [nonce, setNonce] = useState(0);
  const pullStart = useRef<number | null>(null);

  useEffect(() => {
    const up = () => setOnline(navigator.onLine); up();
    window.addEventListener("online", up); window.addEventListener("offline", up);
    return () => { window.removeEventListener("online", up); window.removeEventListener("offline", up); };
  }, []);
  useEffect(() => {
    if (workspaceId) return;
    let alive = true;
    void listWorkspaces().then(r => { if (alive && r.status === "ready") setWs(r.selectedId); else if (alive) setView({ status: "error", error: "WORKSPACE_FORBIDDEN" }); })
      .catch(() => { if (alive) setView({ status: navigator.onLine ? "error" : "offline", error: navigator.onLine ? undefined : "OFFLINE" }); });
    return () => { alive = false; };
  }, [workspaceId]);
  useEffect(() => {
    if (!ws) return;
    const abort = new AbortController();
    void (async () => {
      try {
        const res = await fetch("/api/engines/mausbot/journal?workspaceId=" + encodeURIComponent(ws), { credentials: "same-origin", signal: abort.signal });
        const body = await res.json();
        if (!res.ok) { setView(v => v.data ? v : { status: res.status === 503 || res.status === 404 ? "offline" : "error", error: body.error }); return; }
        if (body.source !== "supabase-read-only" || !Array.isArray(body.items)) throw Error("bad");
        setView({ status: "ready", data: body as Payload });
      } catch { if (!abort.signal.aborted) setView(v => v.data ? v : { status: "error" }); }
    })();
    return () => abort.abort();
  }, [ws, nonce]);

  const postState = useCallback(async (editionId: string, itemId: string, status: ReadState) => {
    const res = await fetch("/api/engines/mausbot/journal/state", { method: "POST", credentials: "same-origin",
      headers: { "Content-Type": "application/json" }, body: JSON.stringify({ workspaceId: ws, editionId, itemId, status }) });
    if (!res.ok) throw Error("state");
  }, [ws]);
  const patch = useCallback((ids: Map<string, ReadState>) => setView(v => v.data ? { ...v, data: { ...v.data, items: v.data.items.map(i => ids.has(i.id) ? { ...i, state: ids.get(i.id)! } : i) } } : v), []);
  const setState = useCallback(async (item: Item, status: ReadState) => {
    patch(new Map([[item.id, status]]));
    try { await postState(item.editionId, item.id, status); } catch { patch(new Map([[item.id, item.state]])); }
  }, [patch, postState]);

  const all = useMemo(() => view.data?.items ?? [], [view.data]);
  const items = useMemo(() => all.filter(i => (filter === "all" || i.category === filter) && (!hideDone || i.state !== "done")), [all, filter, hideDone]);
  const featured = filter === "all" ? pickFeatured(items) : null;
  const rest = items.filter(i => i !== featured);
  const ordered = featured ? [featured, ...rest] : rest;
  const reading = readingId ? all.find(i => i.id === readingId) ?? null : null;
  const total = all.length;
  const done = all.filter(i => i.state === "done").length;
  const label = useCallback((c: Category) => view.data?.categories.find(x => x.id === c)?.label ?? c, [view.data]);
  const open = (item: Item) => { setReadingId(item.id); if (item.state === "new") void setState(item, "read"); };
  const nav = useCallback((item: Item) => { setReadingId(item.id); if (item.state === "new") void setState(item, "read"); }, [setState]);
  const plan = bulkDonePlan(all, filter);
  const filterLabel = filter === "all" ? "toute l’édition" : "« " + label(filter) + " »";

  const bulkDone = async () => {
    setConfirm(false);
    patch(new Map(plan.map(p => [p.id, "done" as ReadState])));
    setUndo({ label: plan.length + " article" + (plan.length > 1 ? "s" : "") + " marqué" + (plan.length > 1 ? "s" : "") + " terminé" + (plan.length > 1 ? "s" : ""), plan });
    const failed = new Map<string, ReadState>();
    for (const p of plan) { try { await postState(p.editionId, p.id, "done"); } catch { failed.set(p.id, p.previous); } }
    if (failed.size) patch(failed);
  };
  const undoBulk = async () => {
    if (!undo) return;
    const u = undo; setUndo(null);
    patch(new Map(u.plan.map(p => [p.id, p.previous])));
    for (const p of u.plan) { try { await postState(p.editionId, p.id, p.previous); } catch {} }
  };
  useEffect(() => { if (!undo) return; const t = setTimeout(() => setUndo(null), 8000); return () => clearTimeout(t); }, [undo]);

  return <main className="mj-page" id="main-content"
    onTouchStart={e => { pullStart.current = window.scrollY <= 0 && !reading ? e.touches[0].clientY : null; }}
    onTouchMove={e => { if (pullStart.current !== null) setPull(Math.max(0, Math.min(90, e.touches[0].clientY - pullStart.current))); }}
    onTouchEnd={() => { if (pull >= 70) setNonce(n => n + 1); pullStart.current = null; setPull(0); }}>
    <div className="mj-pull" style={{ height: pull }} aria-hidden><span className={pull >= 70 ? "is-ready" : ""}><Icon name="rotate-ccw" /></span></div>
    {!online && <p className="mj-offline" role="status">Hors ligne — {view.data ? "dernière édition enregistrée sur cet appareil" : "aucune édition enregistrée"}.</p>}
    {online && view.data?.offline && <p className="mj-offline" role="status">Édition enregistrée affichée (réseau indisponible).</p>}
    <IosInstallHint />
    <header className="mj-masthead">
      <p className="mj-kicker">WORLD RADAR · {view.data?.producer === "grok-bot" ? "Grok Bot" : "MORGANS & équipe"}</p>
      <h1>Journal du matin</h1>
      {view.data && <p className="mj-edition">{dateLabel(view.data.generatedAt) ?? "Édition " + view.data.editionId}{view.data.demo && " · données de démonstration"}</p>}
      {view.data && <div className="mj-progress" role="progressbar" aria-label="Articles terminés" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done}>
        <span style={{ width: total ? (100 * done / total) + "%" : "0%" }} /><b>{done}/{total} terminés</b>
      </div>}
    </header>
    {view.status === "loading" && <div className="mj-skeleton" aria-busy="true" aria-label="Chargement de l’édition"><span /><span /><span /></div>}
    {(view.status === "offline" || view.status === "error") && !view.data && <p className="mj-state is-warn" role="alert">{errorText(view.error)}</p>}
    {view.data && <>
      <nav className="mj-tabs" aria-label="Thèmes">
        <button aria-pressed={filter === "all"} className={filter === "all" ? "is-active" : ""} onClick={() => setFilter("all")}>Tout <span>{total}</span></button>
        {view.data.categories.map(c => <button key={c.id} aria-pressed={filter === c.id} disabled={!c.count} className={(filter === c.id ? "is-active " : "") + "is-" + c.id} onClick={() => setFilter(c.id)}>{c.label} <span>{c.count}</span></button>)}
      </nav>
      {!view.data.stateAvailable && <p className="mj-state is-warn">Suivi lu/terminé indisponible (migration feed_item_state non appliquée).</p>}
      <section className="mj-grid" aria-label="Articles">
        {ordered.map(item => <article key={item.id} className={"mj-card" + (item === featured ? " is-lead" : "") + " is-state-" + item.state}>
          <button className="mj-card-open" onClick={() => open(item)} tabIndex={-1} aria-hidden><Cover item={item} large={item === featured} label={label(item.category)} /></button>
          <div className="mj-card-body">
            <p className={"mj-cat is-" + item.category}>{item === featured && <span className="mj-une">À la une</span>}{label(item.category)}{item.state === "new" && <i className="mj-dot" role="img" aria-label="nouveau" />}</p>
            <h2><button onClick={() => open(item)}>{item.title}</button></h2>
            <p className="mj-summary">{item.summary.replace(/[*_>#]|\[([^\]]+)\]\([^)]+\)/g, "$1")}</p>
            <p className="mj-card-meta">{item.sourceName ?? "Source non fournie"} · {readingMinutes(item.title, item.summary, item.whyItMatters)} min</p>
            <div className="mj-actions">
              {item.state !== "done" ? <button onClick={() => void setState(item, "done")} aria-label={"Marquer terminé : " + item.title}>Terminé</button>
                : <button onClick={() => void setState(item, "read")} aria-label={"Rouvrir : " + item.title}>Rouvrir</button>}
              {item.state === "new" && <button onClick={() => void setState(item, "read")} aria-label={"Marquer lu : " + item.title}>Lu</button>}
            </div>
          </div>
        </article>)}
        {!items.length && <p className="mj-state">Rien dans ce thème pour cette édition.</p>}
      </section>
      <div className="mj-actionbar" role="toolbar" aria-label="Actions du journal">
        <button aria-pressed={hideDone} onClick={() => setHideDone(!hideDone)}>{hideDone ? "Afficher terminés" : "Masquer terminés"}</button>
        <button disabled={!plan.length} onClick={() => setConfirm(true)}>Tout marquer terminé</button>
        <button className="mj-icon-btn" onClick={() => setNonce(n => n + 1)} aria-label="Actualiser l’édition"><Icon name="rotate-ccw" /></button>
      </div>
    </>}
    {confirm && <div className="mj-confirm" role="alertdialog" aria-modal="true" aria-labelledby="mj-confirm-t">
      <div><p id="mj-confirm-t">Marquer terminé {plan.length} article{plan.length > 1 ? "s" : ""} de {filterLabel} ?</p>
        <div className="mj-actions"><button autoFocus onClick={() => setConfirm(false)}>Annuler</button><button className="mj-primary" onClick={() => void bulkDone()}>Confirmer</button></div></div>
    </div>}
    {undo && <div className="mj-toast" role="status"><span>{undo.label}</span><button onClick={() => void undoBulk()}>Annuler</button></div>}
    {reading && <Reader item={reading} list={ordered.length && ordered.some(i => i.id === reading.id) ? ordered : all} label={label}
      onClose={() => setReadingId(null)} onNav={nav} onState={(i, s) => void setState(i, s)} />}
  </main>;
}
