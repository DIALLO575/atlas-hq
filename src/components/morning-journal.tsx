"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/icon";
import { listWorkspaces } from "@/app/workspaces/actions";

type Category = "ia" | "commerce" | "guinee" | "afrique" | "monde" | "economie";
type ReadState = "new" | "read" | "done";
type Item = {
  id: string; editionId: string; category: Category; title: string; summary: string; whyItMatters: string | null;
  certainty: "elevee" | "moyenne" | "faible" | null; status: "confirme" | "rapporte" | "a_verifier" | null;
  sourceUrl: string | null; sourceName: string | null; extraSources: { url: string; name: string | null }[];
  publishedAt: string | null; authorBot: string | null; state: ReadState;
  cover: { storagePath: string; generated: boolean; alt: string; credit: string | null; sourceName: string | null } | null; coverUrl: string | null;
};
type Payload = { source: "supabase-read-only"; producer: string; demo: boolean; editionId: string; generatedAt: string | null;
  categories: { id: Category; label: string; count: number }[]; items: Item[]; stateAvailable: boolean };
type View = { status: "loading" | "ready" | "offline" | "error"; data?: Payload; error?: string };

const CERTAINTY: Record<string, string> = { elevee: "Certitude élevée", moyenne: "Certitude moyenne", faible: "Certitude faible" };
const STATUS: Record<string, string> = { confirme: "Confirmé", rapporte: "Rapporté", a_verifier: "À vérifier" };
function errorText(code?: string) {
  if (code === "JOURNAL_SOURCE_UNAVAILABLE") return "Tables du journal indisponibles (migrations non appliquées ou Supabase injoignable).";
  if (code === "JOURNAL_OWNER_REQUIRED" || code === "ENGINE_WRITE_FORBIDDEN" || code === "WORKSPACE_FORBIDDEN") return "Le journal est réservé au propriétaire du workspace.";
  if (code === "AUTH_REQUIRED") return "Connectez-vous pour lire le journal.";
  if (code === "JOURNAL_EDITION_NOT_FOUND") return "Aucune édition disponible pour l’instant.";
  return "Journal indisponible. Aucun contenu n’est supposé.";
}
function dateLabel(v: string | null) {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }).format(d);
}

function Cover({ item, large }: { item: Item; large?: boolean }) {
  const [failed, setFailed] = useState(false);
  const src = item.coverUrl && !failed ? item.coverUrl : null;
  return <figure className={"mj-cover" + (large ? " is-large" : "")}>
    {src
      // eslint-disable-next-line @next/next/no-img-element
      ? <img src={src} alt={item.cover?.alt ?? ""} loading="lazy" onError={() => setFailed(true)} />
      : <span className="mj-cover-fallback" aria-hidden />}
    {item.cover?.generated && <figcaption className="mj-generated">Illustration générée</figcaption>}
    {item.cover && !item.cover.generated && (item.cover.credit || item.cover.sourceName) && <figcaption className="mj-credit">{[item.cover.credit, item.cover.sourceName].filter(Boolean).join(" · ")}</figcaption>}
  </figure>;
}
function Badges({ item }: { item: Item }) {
  return <div className="mj-badges">
    {item.certainty && <span className={"mj-badge is-" + item.certainty}>{CERTAINTY[item.certainty]}</span>}
    {item.status && <span className={"mj-badge is-status-" + item.status}>{STATUS[item.status]}</span>}
    {item.state === "done" && <span className="mj-badge is-done">Terminé</span>}
  </div>;
}
function Sources({ item }: { item: Item }) {
  const all = [...(item.sourceUrl ? [{ url: item.sourceUrl, name: item.sourceName }] : []), ...item.extraSources];
  if (!all.length) return <p className="mj-sources is-missing">Source non fournie</p>;
  return <p className="mj-sources">Source{all.length > 1 ? "s" : ""} : {all.map((s, i) =>
    <a key={s.url + i} href={s.url} target="_blank" rel="noopener noreferrer nofollow">{s.name ?? "lien"}<Icon name="arrow-up-right" /></a>)}</p>;
}

export function MorningJournal({ workspaceId }: { workspaceId?: string }) {
  const [ws, setWs] = useState(workspaceId ?? "");
  const [view, setView] = useState<View>({ status: "loading" });
  const [filter, setFilter] = useState<Category | "all">("all");
  const [reading, setReading] = useState<Item | null>(null);
  const [hideDone, setHideDone] = useState(false);

  useEffect(() => {
    if (workspaceId) return;
    let alive = true;
    void listWorkspaces().then(r => { if (alive && r.status === "ready") setWs(r.selectedId); else if (alive) setView({ status: "error", error: "WORKSPACE_FORBIDDEN" }); })
      .catch(() => { if (alive) setView({ status: "error" }); });
    return () => { alive = false; };
  }, [workspaceId]);
  useEffect(() => {
    if (!ws) return;
    const abort = new AbortController();
    void (async () => {
      try {
        const res = await fetch("/api/engines/mausbot/journal?workspaceId=" + encodeURIComponent(ws), { credentials: "same-origin", signal: abort.signal });
        const body = await res.json();
        if (!res.ok) { setView({ status: res.status === 503 || res.status === 404 ? "offline" : "error", error: body.error }); return; }
        if (body.source !== "supabase-read-only" || !Array.isArray(body.items)) throw Error("bad");
        setView({ status: "ready", data: body as Payload });
      } catch { if (!abort.signal.aborted) setView({ status: "error" }); }
    })();
    return () => abort.abort();
  }, [ws]);

  const setState = useCallback(async (item: Item, status: ReadState) => {
    setView(v => v.data ? { ...v, data: { ...v.data, items: v.data.items.map(i => i.id === item.id ? { ...i, state: status } : i) } } : v);
    setReading(r => r && r.id === item.id ? { ...r, state: status } : r);
    try {
      const res = await fetch("/api/engines/mausbot/journal/state", { method: "POST", credentials: "same-origin",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify({ workspaceId: ws, editionId: item.editionId, itemId: item.id, status }) });
      if (!res.ok) throw Error("state");
    } catch {
      setView(v => v.data ? { ...v, data: { ...v.data, items: v.data.items.map(i => i.id === item.id ? { ...i, state: item.state } : i) } } : v);
    }
  }, [ws]);

  const items = useMemo(() => (view.data?.items ?? []).filter(i => (filter === "all" || i.category === filter) && (!hideDone || i.state !== "done")), [view.data, filter, hideDone]);
  const total = view.data?.items.length ?? 0;
  const done = view.data?.items.filter(i => i.state === "done").length ?? 0;
  const open = (item: Item) => { setReading(item); if (item.state === "new") void setState(item, "read"); };

  return <main className="mj-page">
    <header className="mj-masthead">
      <p className="mj-kicker">WORLD RADAR · {view.data?.producer === "grok-bot" ? "Grok Bot" : "MORGANS & équipe"}</p>
      <h1>Journal du matin</h1>
      {view.data && <p className="mj-edition">{dateLabel(view.data.generatedAt) ?? "Édition " + view.data.editionId}{view.data.demo && " · données de démonstration"}</p>}
      {view.data && <div className="mj-progress" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done}>
        <span style={{ width: total ? (100 * done / total) + "%" : "0%" }} /><b>{done}/{total} terminés</b>
      </div>}
    </header>
    {view.status === "loading" && <p className="mj-state">Chargement de l’édition…</p>}
    {(view.status === "offline" || view.status === "error") && <p className="mj-state is-warn">{errorText(view.error)}</p>}
    {view.data && <>
      <nav className="mj-tabs" aria-label="Thèmes">
        <button className={filter === "all" ? "is-active" : ""} onClick={() => setFilter("all")}>Tout <span>{total}</span></button>
        {view.data.categories.map(c => <button key={c.id} disabled={!c.count} className={(filter === c.id ? "is-active " : "") + "is-" + c.id} onClick={() => setFilter(c.id)}>{c.label} <span>{c.count}</span></button>)}
        <label className="mj-hide"><input type="checkbox" checked={hideDone} onChange={e => setHideDone(e.target.checked)} /> Masquer terminés</label>
      </nav>
      {!view.data.stateAvailable && <p className="mj-state is-warn">Suivi lu/terminé indisponible (migration feed_item_state non appliquée).</p>}
      <section className="mj-grid">
        {items.map((item, idx) => <article key={item.id} className={"mj-card" + (idx === 0 && filter === "all" ? " is-lead" : "") + " is-state-" + item.state}>
          <button className="mj-card-open" onClick={() => open(item)} aria-label={"Lire : " + item.title}><Cover item={item} /></button>
          <div className="mj-card-body">
            <p className={"mj-cat is-" + item.category}>{view.data!.categories.find(c => c.id === item.category)?.label}{item.state === "new" && <i className="mj-dot" aria-label="nouveau" />}</p>
            <h2><button onClick={() => open(item)}>{item.title}</button></h2>
            <p className="mj-summary">{item.summary}</p>
            <Badges item={item} />
            <Sources item={item} />
            <div className="mj-actions">
              {item.state !== "done" ? <button className="mj-primary" onClick={() => void setState(item, "done")}>Marquer terminé</button>
                : <button onClick={() => void setState(item, "read")}>Rouvrir</button>}
              {item.state === "new" && <button onClick={() => void setState(item, "read")}>Marquer lu</button>}
            </div>
          </div>
        </article>)}
        {!items.length && <p className="mj-state">Rien dans ce thème pour cette édition.</p>}
      </section>
    </>}
    {reading && <div className="mj-reader" role="dialog" aria-modal="true" aria-label={reading.title}>
      <div className="mj-reader-inner">
        <button className="mj-close" onClick={() => setReading(null)} aria-label="Fermer"><Icon name="close" /></button>
        <Cover item={reading} large />
        <p className={"mj-cat is-" + reading.category}>{view.data?.categories.find(c => c.id === reading.category)?.label}{reading.authorBot && " · " + reading.authorBot}</p>
        <h2>{reading.title}</h2>
        <Badges item={reading} />
        <p className="mj-lede">{reading.summary}</p>
        {reading.whyItMatters && <><h3>Pourquoi c’est important</h3><p>{reading.whyItMatters}</p></>}
        <Sources item={reading} />
        <div className="mj-actions">
          {reading.state !== "done" ? <button className="mj-primary" onClick={() => { void setState(reading, "done"); setReading(null); }}>Marquer terminé</button>
            : <button onClick={() => void setState(reading, "read")}>Rouvrir</button>}
        </div>
      </div>
    </div>}
  </main>;
}
