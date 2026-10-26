"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useState } from "react";
import { Icon } from "@/components/icon";
import { SessionControls } from "@/components/session-controls";
import { WorkspaceSelector } from "@/components/workspace-selector";
import { useFloatingDock } from "@/components/use-floating-dock";
import { listWorkspaces } from "@/app/workspaces/actions";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

const navItems = [
  { label: "Accueil", icon: "grid" as const, href: "/" },
  { label: "Workspaces", icon: "layers" as const, href: "/workspaces" },
  { label: "Missions", icon: "activity" as const, href: "/missions" },
  { label: "Agents & Équipes", icon: "bot" as const, href: "/agents" },
  { label: "Moteurs IA", icon: "layers" as const, href: "/engines" },
  { label: "Mes Apps", icon: "apps" as const, href: "/apps" },
  { label: "Inbox", icon: "inbox" as const, href: "/inbox" },
  { label: "Journal", icon: "spark" as const, href: "/journal" },
  { label: "Lecture", icon: "layers" as const, href: "/lecture" },
];

const utilityItems = [
  { label: "Recherche globale", icon: "search" as const, href: "/search" },
  { label: "Éléments liés", icon: "link" as const, href: "/related" },
  { label: "Chief", icon: "spark" as const, href: "/chief" },
  { label: "Paramètres", icon: "settings" as const, href: "/settings" },
];

const mobileItems = [navItems[0], navItems[2], navItems[5], navItems[8]];

// Retain only the expanded/collapsed preference between client-side navigations.
let cachedExpanded: boolean | null = null;

function initialDarkMode() {
  if (typeof window === "undefined") return false;
  try {
    const saved = window.localStorage.getItem("atlas:theme");
    return saved ? saved === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches;
  } catch {
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  }
}

// Route pages keep their existing <AppShell> wrappers, but the actual dock lives
// once in the persistent root layout. Nested wrappers render only page content.
const AppShellContext = createContext(false);
const JournalUnreadContext = createContext<number | null>(null);

export function useJournalUnread() { return useContext(JournalUnreadContext); }

export function AppShell({ children }: Readonly<{ children: React.ReactNode }>) {
  const insidePersistentShell = useContext(AppShellContext);
  if (insidePersistentShell) return <>{children}</>;
  return <AppShellFrame>{children}</AppShellFrame>;
}

export function AppShellFrame({ children }: Readonly<{ children: React.ReactNode }>) {
  const pathname = usePathname();
  const router = useRouter();
  const [expanded, setExpanded] = useState(() => cachedExpanded ?? false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [moveControlsOpen, setMoveControlsOpen] = useState(false);
  // Give instant visual feedback while Next.js loads the next route.
  // The dock itself remains mounted; only the page content changes.
  const [navigatingTo, setNavigatingTo] = useState<string | null>(null);
  const [journalUnread, setJournalUnread] = useState<number | null>(null);
  const [darkMode, setDarkMode] = useState(initialDarkMode);
  const isRoutePending = Boolean(navigatingTo && navigatingTo !== pathname);

  useEffect(() => {
    if (pathname === "/journal") return;
    let alive = true;
    let request = 0;
    const refreshUnread = async () => {
      const current = ++request;
      try {
        const workspaces = await listWorkspaces();
        if (workspaces.status !== "ready" || !workspaces.selectedId) {
          if (alive && current === request) setJournalUnread(null);
          return;
        }
        const response = await fetch(`/api/engines/mausbot/journal/summary?workspaceId=${encodeURIComponent(workspaces.selectedId)}`, { cache: "no-store" });
        if (!response.ok) throw new Error("summary unavailable");
        const summary = await response.json() as { unread?: unknown };
        if (alive && current === request) setJournalUnread(typeof summary.unread === "number" ? summary.unread : null);
      } catch { if (alive) setJournalUnread(null); }
    };
    const update = () => { void refreshUnread(); };
    const onVisible = () => { if (document.visibilityState === "visible") void refreshUnread(); };
    const supabase = createSupabaseBrowserClient();
    const auth = supabase?.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") { request++; setJournalUnread(null); }
      else if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") void refreshUnread();
    });
    window.addEventListener("journal:updated", update);
    window.addEventListener("focus", onVisible);
    document.addEventListener("visibilitychange", onVisible);
    void refreshUnread();
    return () => { alive = false; auth?.data.subscription.unsubscribe(); window.removeEventListener("journal:updated", update); window.removeEventListener("focus", onVisible); document.removeEventListener("visibilitychange", onVisible); };
  }, [pathname]);

  useEffect(() => {
    document.documentElement.dataset.atlasTheme = darkMode ? "dark" : "light";
  }, [darkMode]);

  const toggleTheme = () => setDarkMode(current => {
    const next = !current;
    document.documentElement.dataset.atlasTheme = next ? "dark" : "light";
    try { window.localStorage.setItem("atlas:theme", next ? "dark" : "light"); } catch {}
    return next;
  });

  const {
    dockRef, side: dockSide, dragging: dockDragging, dockStyle,
    handlePointerDown, handlePointerMove, handlePointerUp, handlePointerCancel,
    handleKeyboardMove, resetPosition, moveDock, placeDock, centerDock, moveControlsStyle,
    canMoveUp, canMoveDown, consumeDragClick,
  } = useFloatingDock();

  useEffect(() => {
    if (cachedExpanded !== null) return;
    const frame = window.requestAnimationFrame(() => {
      try {
        const saved = window.localStorage.getItem("atlas:dock-expanded") === "true";
        cachedExpanded = saved;
        setExpanded(saved);
      } catch {
        cachedExpanded = false;
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setMenuOpen(false);
        router.push("/search");
      }
      if (event.key === "Escape") {
        setMenuOpen(false);
        setMoveControlsOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [router]);

  const toggleExpanded = () => {
    setExpanded((current) => {
      const next = !current;
      cachedExpanded = next;
      try { window.localStorage.setItem("atlas:dock-expanded", String(next)); } catch {}
      return next;
    });
  };

  const closeMenu = () => {
    setMenuOpen(false);
    setMoveControlsOpen(false);
  };
  const handleRouteClick = (href: string) => {
    closeMenu();
    if (href !== pathname) setNavigatingTo(href);
  };
  const prefetchRoute = (href: string) => {
    if (href !== pathname) router.prefetch(href);
  };
  useEffect(() => {
    if (!isRoutePending) return;
    // A failed request must not leave the navigation indicator visible forever.
    const timeout = window.setTimeout(() => setNavigatingTo(null), 12000);
    return () => window.clearTimeout(timeout);
  }, [isRoutePending, navigatingTo]);


  useEffect(() => {
    if (!moveControlsOpen) return;
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!(event.target instanceof Element) ||
          (!event.target.closest(".atlas-dock-move-panel") && !event.target.closest(".atlas-dock-grip"))) {
        setMoveControlsOpen(false);
      }
    };
    document.addEventListener("pointerdown", closeOnOutsideClick);
    return () => document.removeEventListener("pointerdown", closeOnOutsideClick);
  }, [moveControlsOpen]);
  const linkClass = (href: string) => "atlas-dock-link" + (pathname === href ? " atlas-dock-active" : "");
  const currentLabel = [...navItems, ...utilityItems].find((item) => item.href === pathname)?.label ?? "Atlas";

  if (pathname === "/journal" || pathname.startsWith("/lecture/")) return (
    <AppShellContext.Provider value={true}>
      <JournalUnreadContext.Provider value={null}>
        <div className={"app-shell atlas-shell atlas-journal-shell" + (darkMode ? " atlas-dark-mode" : "") + (pathname.startsWith("/lecture/") ? " atlas-book-reader-shell" : "")}>
          <a className="skip-link" href="#main-content">Aller au contenu principal</a>
          <div className="atlas-main-frame">{children}</div>
        </div>
      </JournalUnreadContext.Provider>
    </AppShellContext.Provider>
  );

  return (
    <AppShellContext.Provider value={true}>
    <JournalUnreadContext.Provider value={journalUnread}>
    <div data-dock-side={dockSide} className={"app-shell atlas-shell" + (darkMode ? " atlas-dark-mode" : "") + (expanded ? " atlas-expanded" : "") + (menuOpen ? " atlas-mobile-open" : "") + (dockDragging ? " atlas-dock-is-dragging" : "")}>
      <a className="skip-link" href="#main-content">Aller au contenu principal</a>

      <header className="atlas-topbar">
        <div className="atlas-topbar-start">
          <button type="button" className="atlas-mobile-toggle" onClick={() => setMenuOpen((open) => !open)} aria-expanded={menuOpen} aria-label={menuOpen ? "Fermer le menu" : "Ouvrir le menu"}>
            <Icon name={menuOpen ? "close" : "menu"} />
          </button>
          <Link className="atlas-wordmark" href="/" onClick={() => handleRouteClick("/")} aria-label="Atlas, accueil">
            <span className="atlas-mark" aria-hidden="true">A</span><span>Atlas</span>
          </Link>
          <span className="atlas-location"><span>/</span>{currentLabel}</span>
        </div>
        <Link className="atlas-search-trigger" href="/search" onClick={() => handleRouteClick("/search")} aria-label="Recherche globale">
          <Icon name="search" /><span>Rechercher une mission, un agent, une app...</span><kbd>⌘ K</kbd>
        </Link>
        <div className="atlas-topbar-end">
          <Link className="atlas-chief-shortcut" href="/chief" onClick={() => handleRouteClick("/chief")}><Icon name="spark" /><span>Chief of Staff</span></Link>
          <button type="button" className="atlas-theme-toggle" onClick={toggleTheme} aria-pressed={darkMode} aria-label={darkMode ? "Activer le mode clair" : "Activer le mode sombre"} title={darkMode ? "Mode clair" : "Mode sombre"}><span aria-hidden="true">{darkMode ? "☀" : "◐"}</span><small>{darkMode ? "Clair" : "Sombre"}</small></button>
          <Link className="atlas-notification-link" href="/inbox" onClick={() => handleRouteClick("/inbox")} aria-label="Ouvrir les demandes à traiter" title="Besoin de vous"><Icon name="inbox" /></Link>
          <div className="atlas-header-workspace"><WorkspaceSelector /></div>
        </div>
      </header>

      <aside ref={dockRef} style={dockStyle} data-dock-position={dockSide}
        className="atlas-dock atlas-smart-dock" aria-label="Navigation principale">
        <span className="sr-only" role="status" aria-live="polite">
          Dock {dockSide === "top" ? "en haut, centré" : dockSide === "bottom" ? "en bas, centré" : dockSide === "left" ? "à gauche" : "à droite"}
        </span>
        <div className="atlas-dock-title">
          <button className="atlas-dock-grip" type="button"
            title="Déplacer le menu · Cliquer pour afficher les flèches"
            aria-label="Déplacer le menu flottant"
            aria-describedby="atlas-dock-help"
            aria-controls="atlas-dock-move-panel"
            aria-expanded={moveControlsOpen}
            onPointerDown={handlePointerDown}
            onPointerMove={(event) => {
              handlePointerMove(event);
              if (event.buttons === 1 && moveControlsOpen) setMoveControlsOpen(false);
            }}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerCancel}
            onKeyDown={handleKeyboardMove}
            onDoubleClick={resetPosition}
            onClick={() => {
              if (consumeDragClick() || window.innerWidth <= 760) return;
              setMoveControlsOpen((open) => !open);
            }}>
            <Icon name="grip" />
            <span className="atlas-dock-title-text">NAVIGATION</span>
          </button>
          <span className="sr-only" id="atlas-dock-help">
            Cliquez pour ouvrir les flèches et les positions gauche, droite, haut et bas. Utilisez le bouton central pour recentrer, ou glissez pour déplacer librement.
          </span>
          <button className="atlas-expand-toggle" type="button" onClick={toggleExpanded}
            aria-label={expanded ? "Réduire le menu" : "Agrandir le menu"}
            title={expanded ? "Réduire le menu" : "Agrandir le menu"} aria-expanded={expanded}>
            <Icon name={expanded ? (dockSide === "left" ? "chevron-left" : "chevron-right") : (dockSide === "left" ? "chevron-right" : "chevron-left")} />
          </button>
        </div>

        <nav className="atlas-dock-nav" aria-label="Sections principales">
          {navItems.map((item) => (
            <Link key={item.href} href={item.href} title={item.label} aria-label={item.label}
              className={linkClass(item.href)} aria-current={pathname === item.href ? "page" : undefined}
              onClick={() => handleRouteClick(item.href)}
              onMouseEnter={() => prefetchRoute(item.href)}
              onFocus={() => prefetchRoute(item.href)}>
              <Icon name={item.icon} />{item.href === "/journal" && journalUnread !== null && journalUnread > 0 && <span className="atlas-journal-unread-badge">{journalUnread > 99 ? "99+" : journalUnread}</span>}<span className="atlas-dock-label">{item.label}</span>
            </Link>
          ))}
        </nav>

        <div className="atlas-dock-separator" />

        <nav className="atlas-dock-nav atlas-dock-utilities" aria-label="Outils transversaux">
          {utilityItems.map((item) => (
            <Link key={item.href} href={item.href} title={item.label} aria-label={item.label}
              className={linkClass(item.href)} aria-current={pathname === item.href ? "page" : undefined}
              onClick={() => handleRouteClick(item.href)}
              onMouseEnter={() => prefetchRoute(item.href)}
              onFocus={() => prefetchRoute(item.href)}>
              <Icon name={item.icon} /><span className="atlas-dock-label">{item.label}</span>
            </Link>
          ))}
        </nav>

        <div className="atlas-dock-account">
          <SessionControls />
        </div>
      </aside>

      {moveControlsOpen && !dockDragging && (
        <section id="atlas-dock-move-panel" className="atlas-dock-move-panel" style={moveControlsStyle}
          aria-label="Déplacer le dock">
          <div className="atlas-dock-move-heading">
            <strong>Déplacer le dock</strong>
            <button type="button" aria-label="Fermer les commandes de déplacement"
              onClick={() => setMoveControlsOpen(false)}><Icon name="close" /></button>
          </div>
          <div className="atlas-dock-move-pad" role="group" aria-label="Direction du dock">
            <button type="button" className="atlas-dock-move-up" aria-label="Monter le dock"
              disabled={!canMoveUp} onClick={() => moveDock("up")}><Icon name="arrow-up" /></button>
            <button type="button" className="atlas-dock-move-left" aria-label="Envoyer le dock à gauche"
              disabled={dockSide === "left"} onClick={() => moveDock("left")}><Icon name="arrow-left" /></button>
            <button type="button" className="atlas-dock-move-reset" aria-label="Centrer le dock sur ce bord"
              title="Centrer sur ce bord" onClick={centerDock}><Icon name="rotate-ccw" /></button>
            <button type="button" className="atlas-dock-move-right" aria-label="Envoyer le dock à droite"
              disabled={dockSide === "right"} onClick={() => moveDock("right")}><Icon name="arrow-right" /></button>
            <button type="button" className="atlas-dock-move-down" aria-label="Descendre le dock"
              disabled={!canMoveDown} onClick={() => moveDock("down")}><Icon name="arrow-down" /></button>
          </div>
          <div className="atlas-dock-edge-choices" role="group" aria-label="Placer le dock sur un bord">
            <button type="button" onClick={() => { placeDock("top"); setMoveControlsOpen(false); }} aria-pressed={dockSide === "top"}
              className={dockSide === "top" ? "is-active" : ""}><Icon name="arrow-up" /> En haut</button>
            <button type="button" onClick={() => { placeDock("bottom"); setMoveControlsOpen(false); }} aria-pressed={dockSide === "bottom"}
              className={dockSide === "bottom" ? "is-active" : ""}><Icon name="arrow-down" /> En bas</button>
          </div>
          <p className="atlas-dock-move-footnote">Haut / bas : 48 px · centrage automatique</p>
          <button type="button" className="atlas-dock-return" onClick={resetPosition}>Position initiale</button>
        </section>
      )}
      {dockDragging && <div className="atlas-dock-dropguides" aria-hidden="true">
        <span className="atlas-dock-dropguide atlas-dock-dropguide-left">Gauche</span>
        <span className="atlas-dock-dropguide atlas-dock-dropguide-right">Droite</span>
      </div>}
      {menuOpen && <button className="atlas-dock-scrim" type="button" aria-label="Fermer le menu" onClick={closeMenu} />}
      {isRoutePending && (
        <div className="atlas-route-transition" role="status" aria-live="polite">
          <span className="atlas-route-transition-track" aria-hidden="true"><span /></span>
          <span className="atlas-route-transition-label">Ouverture de {[...navItems, ...utilityItems].find((item) => item.href === navigatingTo)?.label ?? "la page"}…</span>
        </div>
      )}
      <div className="atlas-main-frame">{children}</div>

      <nav className="mobile-bottom-nav atlas-mobile-bottom" aria-label="Navigation rapide">
        {mobileItems.map((item) => (
          <Link key={item.href} href={item.href} className={"mobile-nav-item" + (pathname === item.href ? " mobile-nav-active" : "")}
            aria-current={pathname === item.href ? "page" : undefined} onClick={() => handleRouteClick(item.href)}
            onMouseEnter={() => prefetchRoute(item.href)} onFocus={() => prefetchRoute(item.href)}>
            <span className="atlas-mobile-nav-icon"><Icon name={item.icon} />{item.href === "/journal" && journalUnread !== null && journalUnread > 0 && <span className="atlas-journal-unread-badge">{journalUnread > 99 ? "99+" : journalUnread}</span>}</span><span>{item.label}</span>
          </Link>
        ))}
        <button className={"mobile-nav-item" + (menuOpen ? " mobile-nav-active" : "")} type="button"
          aria-expanded={menuOpen} onClick={() => setMenuOpen((open) => !open)}>
          <Icon name={menuOpen ? "close" : "menu"} /><span>Menu</span>
        </button>
      </nav>
    </div>
    </JournalUnreadContext.Provider>
    </AppShellContext.Provider>
  );
}
