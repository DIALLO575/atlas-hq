"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cachedJournalWorkspace } from "@/lib/journal/cache-storage";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { useJournalData } from "@/components/journal/use-journal-data";
import { Icon } from "@/components/icon";
import { useJournalUnread } from "@/components/app-shell";
import { listWorkspaces } from "@/app/workspaces/actions";
import { RichText } from "@/components/journal-rich-text";
import { FONT_STEPS, READER_THEMES, bulkDonePlan, neighbor, pickFeatured, readingMinutes, stepFont, swipeDirection } from "../../packages/engines/mausbot/src/journal-reader.mjs";
import { JOURNAL_READ_THRESHOLD_SECONDS } from "../../packages/engines/mausbot/src/journal-progress.mjs";

type Category = "ia" | "ia-sur-x" | "commerce" | "guinee" | "afrique" | "monde" | "economie";
type ReadState = "new" | "read" | "done";
type Item = {
  id: string; key: string; editionId: string; category: Category; title: string; summary: string; whyItMatters: string | null;
  certainty: "elevee" | "moyenne" | "faible" | null; status: "confirme" | "rapporte" | "a_verifier" | null;
  sourceUrl: string | null; sourceName: string | null; extraSources: { url: string; name: string | null }[];
  publishedAt: string | null; authorBot: string | null; state: ReadState; featured?: boolean;
  secondsRead?: number; lastPosition?: number | null; firstReadAt?: string | null;
  cover: { storagePath: string; generated: boolean; alt: string; credit: string | null; sourceName: string | null } | null; coverUrl: string | null;
};
type Payload = { source: "supabase-read-only"; producer: string; demo: boolean; editionId: string; generatedAt: string | null; offline?: boolean;
  categories: { id: Category; label: string; count: number }[]; items: Item[]; stateAvailable: boolean };
type Theme = (typeof READER_THEMES)[number];
type Undo = { label: string; plan: { key: string; id: string; editionId: string; previous: "new" | "read" }[] } | null;
type ReadingSummary = { total: number; read: number; unread: number; percentRead: number; todayMinutes: number | null; sevenDayMinutes: number | null; progressAvailable: boolean; warning?: string; byCategory: Record<string, { total: number; read: number }>; byProducer: Record<string, { total: number; read: number }> };
type JournalSection = "featured" | "categories" | "unread" | "stats";

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

function Reader({ item, list, label, onClose, onNav, onState, preferences, savePreference, onProgress }: {
  preferences: Record<string, string | number>; savePreference: (key: string, value: string | number) => void;
  item: Item; list: Item[]; label: (c: Category) => string; onClose: () => void; onNav: (i: Item) => void; onState: (i: Item, s: ReadState) => void;
  onProgress: (item: Item, seconds: number, position: number) => Record<string, unknown> | null;
}) {
  const size = typeof preferences.font === "number" && Number.isInteger(preferences.font) && preferences.font >= 0 && preferences.font < FONT_STEPS.length ? preferences.font : 1;
  const theme: Theme = READER_THEMES.includes(preferences.theme as Theme) ? preferences.theme as Theme : "light";
  const setSize = (value: number) => savePreference("font", value);
  const setTheme = (value: Theme) => savePreference("theme", value);
  const [progress, setProgress] = useState(0);
  const scroller = useRef<HTMLDivElement>(null);
  const closeBtn = useRef<HTMLButtonElement>(null);
  const touch = useRef<{ x: number; y: number } | null>(null);
  const onProgressRef = useRef(onProgress);
  useEffect(() => { onProgressRef.current = onProgress; }, [onProgress]);
  const prev = neighbor(list, item.key, -1), next = neighbor(list, item.key, 1);
  const minutes = readingMinutes(item.title, item.summary, item.whyItMatters);
  const sources = sourcesOf(item);

  useEffect(() => {
    const el = scroller.current;
    if (el) {
      const position = Math.max(0, Math.min(1, item.lastPosition ?? 0));
      el.scrollTop = Math.max(0, el.scrollHeight - el.clientHeight) * position;
      const max = el.scrollHeight - el.clientHeight;
      setProgress(max > 0 ? 100 * el.scrollTop / max : 0);
    }
    closeBtn.current?.focus();
  }, [item.key, item.lastPosition]);
  useEffect(() => {
    let lastActivity = Date.now();
    let lastTick = lastActivity;
    let pendingSeconds = 0;
    const activity = () => { lastActivity = Date.now(); };
    const position = () => {
      const el = scroller.current;
      if (!el) return 0;
      const max = el.scrollHeight - el.clientHeight;
      return max > 0 ? Math.round(Math.max(0, Math.min(1, el.scrollTop / max)) * 100) / 100 : 0;
    };
    const send = (beacon: boolean) => {
      const seconds = Math.min(120, Math.floor(pendingSeconds));
      if (seconds < 1) return;
      pendingSeconds -= seconds;
      const body = onProgressRef.current(item, seconds, position());
      if (beacon && body && navigator.sendBeacon) {
        navigator.sendBeacon("/api/engines/mausbot/journal/progress", new Blob([JSON.stringify(body)], { type: "application/json" }));
      }
    };
    const tick = () => {
      const now = Date.now();
      const elapsed = Math.min(JOURNAL_READ_THRESHOLD_SECONDS, (now - lastTick) / 1000);
      lastTick = now;
      if (document.visibilityState === "visible" && document.hasFocus() && now - lastActivity <= 60_000) pendingSeconds += elapsed;
      if (pendingSeconds >= 15) send(false);
    };
    const visibility = () => { lastTick = Date.now(); if (document.visibilityState === "visible") activity(); };
    const flush = () => send(true);
    const interval = window.setInterval(tick, 15000);
    window.addEventListener("focus", visibility);
    window.addEventListener("blur", visibility);
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", visibility);
    const el = scroller.current;
    el?.addEventListener("scroll", activity, { passive: true });
    el?.addEventListener("touchstart", activity, { passive: true });
    el?.addEventListener("keydown", activity);
    el?.addEventListener("pointerdown", activity, { passive: true });
    activity();
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", visibility);
      window.removeEventListener("blur", visibility);
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", visibility);
      el?.removeEventListener("scroll", activity);
      el?.removeEventListener("touchstart", activity);
      el?.removeEventListener("keydown", activity);
      el?.removeEventListener("pointerdown", activity);
      send(false);
    };
  }, [item]);
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
  const [section, setSection] = useState<JournalSection>("featured");
  const [filter, setFilter] = useState<Category | "all">("all");
  const [readingId, setReadingId] = useState<string | null>(null);
  const [hideDone, setHideDone] = useState(false);
  const [online, setOnline] = useState(true);
  const [confirm, setConfirm] = useState(false);
  const [undo, setUndo] = useState<Undo>(null);
  const [pull, setPull] = useState(0);
  const [nonce, setNonce] = useState(0);
  const [summary, setSummary] = useState<ReadingSummary | null>(null);
  const [summaryStatus, setSummaryStatus] = useState<"loading" | "ready" | "error">("loading");
  const { view, setView, enqueue, preferences, savePreference } = useJournalData<Payload>(ws, nonce);
  const shellUnread = useJournalUnread();
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
      .catch(async () => {
        const session = await createSupabaseBrowserClient()?.auth.getSession();
        const userId = session?.data.session?.user.id;
        const cached = userId ? await cachedJournalWorkspace(userId).catch(() => null) : null;
        if (alive && cached) setWs(cached); else if (alive) setView({ status: "offline", error: "OFFLINE" });
      });
    return () => { alive = false; };
  }, [workspaceId, setView]);
  useEffect(() => {
    if (!ws) return;
    let alive = true;
    const load = async () => {
      try {
        const response = await fetch(`/api/engines/mausbot/journal/summary?workspaceId=${encodeURIComponent(ws)}`, { cache: "no-store" });
        if (!response.ok) throw new Error("summary unavailable");
        const next = await response.json() as ReadingSummary;
        if (alive) { setSummary(next); setSummaryStatus("ready"); }
      } catch { if (alive) { setSummary(null); setSummaryStatus("error"); } }
    };
    const updated = (event: Event) => {
      const eventWorkspace = (event as CustomEvent<{ workspaceId?: string }>).detail?.workspaceId;
      if (!eventWorkspace || eventWorkspace === ws) void load();
    };
    window.addEventListener("journal:updated", updated);
    void load();
    return () => { alive = false; window.removeEventListener("journal:updated", updated); };
  }, [ws]);
  const postState = useCallback(async (editionId: string, itemId: string, status: ReadState) => {
    await enqueue({ id: crypto.randomUUID(), kind: "state", body: { workspaceId: ws, editionId, itemId, status } });
  }, [ws, enqueue]);
  const postProgress = useCallback((item: Item, seconds: number, position: number) => {
    const batchId = crypto.randomUUID();
    const body = { workspaceId: ws, batchId, events: [{ editionId: item.editionId, itemId: item.id, deltaSeconds: Math.min(120, Math.max(0, Math.floor(seconds))), position: Math.max(0, Math.min(1, Math.round(position * 100) / 100)) }] };
    void enqueue({ id: batchId, kind: "progress", body });
    return body;
  }, [ws, enqueue]);

  const patch = useCallback((ids: Map<string, ReadState>) => setView(v => v.data ? { ...v, data: { ...v.data, items: v.data.items.map(i => ids.has(i.key) ? { ...i, state: ids.get(i.key)! } : i) } } : v), [setView]);
  const setState = useCallback(async (item: Item, status: ReadState) => {
    patch(new Map([[item.key, status]]));
    try { await postState(item.editionId, item.id, status); } catch { patch(new Map([[item.key, item.state]])); }
  }, [patch, postState]);

  const all = useMemo(() => view.data?.items ?? [], [view.data]);
  const items = useMemo(() => all.filter(i => (section !== "unread" || i.state === "new") && (filter === "all" || i.category === filter) && (!hideDone || i.state !== "done")), [all, filter, hideDone, section]);
  const featured = filter === "all" ? pickFeatured(items) : null;
  const rest = items.filter(i => i !== featured);
  const ordered = featured ? [featured, ...rest] : rest;
  const reading = readingId ? all.find(i => i.key === readingId) ?? null : null;
  const total = all.length;
  const done = all.filter(i => i.state === "read" || i.state === "done").length;
  const unreadCount = view.data ? all.filter(i => i.state === "new").length : shellUnread ?? summary?.unread ?? 0;
  const label = useCallback((c: Category) => view.data?.categories.find(x => x.id === c)?.label ?? c, [view.data]);
  const open = (item: Item) => { setReadingId(item.key); };
  const nav = useCallback((item: Item) => { setReadingId(item.key); }, []);
  const plan = bulkDonePlan(all, filter);
  const filterLabel = filter === "all" ? "toute l’édition" : "« " + label(filter) + " »";

  const bulkDone = async () => {
    setConfirm(false);
    patch(new Map(plan.map(p => [p.key, "done" as ReadState])));
    setUndo({ label: plan.length + " article" + (plan.length > 1 ? "s" : "") + " marqué" + (plan.length > 1 ? "s" : "") + " terminé" + (plan.length > 1 ? "s" : ""), plan });
    const failed = new Map<string, ReadState>();
    for (const p of plan) { try { await postState(p.editionId, p.id, "done"); } catch { failed.set(p.key, p.previous); } }
    if (failed.size) patch(failed);
  };
  const undoBulk = async () => {
    if (!undo) return;
    const u = undo; setUndo(null);
    patch(new Map(u.plan.map(p => [p.key, p.previous])));
    for (const p of u.plan) { try { await postState(p.editionId, p.id, p.previous); } catch {} }
  };
  useEffect(() => { if (!undo) return; const t = setTimeout(() => setUndo(null), 8000); return () => clearTimeout(t); }, [undo]);

  const navigation: { id: JournalSection | "exit"; label: string; icon: "spark" | "layers" | "inbox" | "activity" | "arrow-left" }[] = [
    { id: "featured", label: "À la une", icon: "spark" },
    { id: "categories", label: "Catégories", icon: "layers" },
    { id: "unread", label: "Non lus", icon: "inbox" },
    { id: "stats", label: "Stats", icon: "activity" },
    { id: "exit", label: "Quitter", icon: "arrow-left" },
  ];
  const chooseSection = (id: JournalSection) => { setSection(id); if (id === "featured" || id === "unread") setFilter("all"); };

  return <div className="mj-app">
    <aside className="mj-rail" aria-label="Navigation du Journal">
      <Link className="mj-rail-brand" href="/" aria-label="Quitter le Journal et revenir à ATLAS HQ"><Icon name="spark" /></Link>
      <nav>
        {navigation.filter(item => item.id !== "exit").map(item => <button key={item.id} type="button" aria-label={item.label} title={item.label}
          aria-current={section === item.id ? "page" : undefined} className={section === item.id ? "is-active" : ""} onClick={() => chooseSection(item.id as JournalSection)}>
          <Icon name={item.icon} /><span>{item.label}</span>{item.id === "unread" && unreadCount > 0 && <b>{unreadCount > 99 ? "99+" : unreadCount}</b>}
        </button>)}
      </nav>
      <Link className="mj-rail-exit" href="/" aria-label="Quitter le Journal"><Icon name="arrow-left" /><span>Quitter</span></Link>
    </aside>
    <main className="mj-page" id="main-content"
    onTouchStart={e => { pullStart.current = e.currentTarget.scrollTop <= 0 && !reading ? e.touches[0].clientY : null; }}
    onTouchMove={e => { if (pullStart.current !== null) setPull(Math.max(0, Math.min(90, e.touches[0].clientY - pullStart.current))); }}
    onTouchEnd={() => { if (pull >= 70) setNonce(n => n + 1); pullStart.current = null; setPull(0); }}>
    <div className="mj-pull" style={{ height: pull }} aria-hidden><span className={pull >= 70 ? "is-ready" : ""}><Icon name="rotate-ccw" /></span></div>
    {!online && <p className="mj-offline" role="status">Hors ligne — {view.data ? "dernière édition enregistrée sur cet appareil" : "aucune édition enregistrée"}.</p>}
    {online && view.data?.offline && <p className="mj-offline" role="status">Édition enregistrée affichée (réseau indisponible).</p>}
    {view.error && view.data && <p className="mj-state is-warn" role="status">Synchronisation différée : {view.error}</p>}
    <IosInstallHint />
    <header className="mj-masthead">
      <p className="mj-kicker">WORLD RADAR</p>
      <h1>Journal du matin</h1>
      {view.data && <p className="mj-edition">{dateLabel(view.data.generatedAt) ?? "Édition " + view.data.editionId}{view.data.demo && " · données de démonstration"}</p>}
      {view.data && <div className="mj-progress" role="progressbar" aria-label="Articles lus ou terminés" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done}>
        <span style={{ width: total ? (100 * done / total) + "%" : "0%" }} /><b>{done}/{total} lus ou terminés</b>
      </div>}
    </header>
    {view.status === "loading" && <div className="mj-skeleton" aria-busy="true" aria-label="Chargement de l’édition"><span /><span /><span /></div>}
    {(view.status === "offline" || view.status === "error") && !view.data && <p className="mj-state is-warn" role="alert">{errorText(view.error)}</p>}
    {view.data && <>
      {section === "categories" && <nav className="mj-tabs" aria-label="Thèmes">
        <button aria-pressed={filter === "all"} className={filter === "all" ? "is-active" : ""} onClick={() => setFilter("all")}>Tout <span>{total}</span></button>
        {view.data.categories.map(c => <button key={c.id} aria-pressed={filter === c.id} disabled={!c.count} className={(filter === c.id ? "is-active " : "") + "is-" + c.id} onClick={() => setFilter(c.id)}>{c.label} <span>{c.count}</span></button>)}
      </nav>}
      {!view.data.stateAvailable && <p className="mj-state is-warn" role="status">La synchronisation du statut de lecture est indisponible.</p>}
      {section === "stats" && <section className="mj-report" aria-labelledby="mj-report-title">
        <header><p className="mj-kicker">VOTRE LECTURE</p><h2 id="mj-report-title">Rapport de lecture</h2><p>Temps reçu par le serveur, en UTC.</p></header>
        {summaryStatus === "error" && <p className="mj-state is-warn" role="status">Les statistiques de lecture sont momentanément indisponibles.</p>}
        {summaryStatus === "ready" && summary && !summary.progressAvailable && <p className="mj-state is-warn" role="status">Le temps de lecture n’est pas disponible sur ce serveur. Le suivi des articles reste affiché séparément.</p>}
        <div className="mj-report-metrics"><article><span>Aujourd’hui</span><strong>{summary?.todayMinutes == null ? "—" : `${summary.todayMinutes} min`}</strong></article><article><span>7 derniers jours</span><strong>{summary?.sevenDayMinutes == null ? "—" : `${summary.sevenDayMinutes} min`}</strong></article><article><span>Articles lus</span><strong>{summary ? `${summary.read}/${summary.total}` : `${total - unreadCount}/${total}`}</strong></article></div>
        <div className="mj-report-grid">{([["Par thème", summary?.byCategory ?? {}], ["Par producteur", summary?.byProducer ?? {}]] as const).map(([title, rows]) => <section key={title}><h3>{title}</h3>
          {Object.entries(rows).length ? Object.entries(rows).map(([name, value]) => <div className="mj-report-row" key={name}><span>{name === "ia-sur-x" ? "IA sur X" : label(name as Category) === name ? name : label(name as Category)}</span><b>{value.read}/{value.total}</b></div>) : <p className="mj-state">Les statistiques apparaîtront après synchronisation.</p>}
        </section>)}</div>
      </section>}
      {section !== "stats" && <section className="mj-grid" aria-label={section === "unread" ? "Articles non lus" : "Articles"}>
        {ordered.map(item => <article key={item.key} className={"mj-card" + (item === featured ? " is-lead" : "") + " is-state-" + item.state}>
          <button className="mj-card-open" onClick={() => open(item)} tabIndex={-1} aria-hidden><Cover item={item} large={item === featured} label={label(item.category)} /></button>
          <div className="mj-card-body">
            <p className={"mj-cat is-" + item.category}>{item === featured && <span className="mj-une">À la une</span>}{label(item.category)}{item.state === "new" && <i className="mj-dot" role="img" aria-label="nouveau" />}</p>
            <h2><button onClick={() => open(item)}>{item.title}</button></h2>
            <p className="mj-summary">{item.summary.replace(/[*_>#]|\[([^\]]+)\]\([^)]+\)/g, "$1")}</p>
            <p className="mj-card-meta">{item.sourceName ?? "Source non fournie"} · {readingMinutes(item.title, item.summary, item.whyItMatters)} min</p>
            <p className="mj-card-state">{item.state === "new" ? "Nouveau" : item.state === "done" ? "Terminé" : item.lastPosition && item.lastPosition > 0 ? `Reprendre · ${Math.round(item.lastPosition * 100)} %` : "Lu"}</p>
            <div className="mj-actions">
              {item.state !== "done" ? <button onClick={() => void setState(item, "done")} aria-label={"Marquer terminé : " + item.title}>Terminé</button>
                : <button onClick={() => void setState(item, "read")} aria-label={"Rouvrir : " + item.title}>Rouvrir</button>}
              {item.state === "new" && <button onClick={() => void setState(item, "read")} aria-label={"Marquer lu : " + item.title}>Lu</button>}
            </div>
          </div>
        </article>)}
        {!items.length && <p className="mj-state">Rien dans ce thème pour cette édition.</p>}
      </section>}
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
    {reading && <Reader preferences={preferences} savePreference={savePreference} item={reading} list={ordered.length && ordered.some(i => i.key === reading.key) ? ordered : all} label={label} onProgress={postProgress}
      onClose={() => setReadingId(null)} onNav={nav} onState={(i, s) => void setState(i, s)} />}
  </main>
  <nav className="mj-mobile-nav" aria-label="Navigation du Journal">
    {navigation.map(item => item.id === "exit" ? <Link key={item.id} href="/" aria-label="Quitter le Journal"><Icon name={item.icon} /><span>{item.label}</span></Link> : <button key={item.id} type="button" aria-current={section === item.id ? "page" : undefined} className={section === item.id ? "is-active" : ""} onClick={() => chooseSection(item.id as JournalSection)}>
      <span className="mj-mobile-nav-icon"><Icon name={item.icon} />{item.id === "unread" && unreadCount > 0 && <b>{unreadCount > 99 ? "99+" : unreadCount}</b>}</span><span>{item.label}</span>
    </button>)}
  </nav>
  </div>;
}
