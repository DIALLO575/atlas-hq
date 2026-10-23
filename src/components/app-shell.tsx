"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Icon } from "@/components/icon";
import { SessionControls } from "@/components/session-controls";
import { WorkspaceSelector } from "@/components/workspace-selector";
import { useFloatingDock } from "@/components/use-floating-dock";
import { DockToolspace } from "@/components/dock-toolspace";
import { dockTools, defaultPinnedTools, MAX_PINNED_TOOLS, type DockToolId } from "@/lib/dock-tools";

const navItems = [
  { label: "Accueil", icon: "grid" as const, href: "/" },
  { label: "Workspaces", icon: "layers" as const, href: "/workspaces" },
  { label: "Missions", icon: "activity" as const, href: "/missions" },
  { label: "Agents & Équipes", icon: "bot" as const, href: "/agents" },
  { label: "Mes Apps", icon: "apps" as const, href: "/apps" },
  { label: "Inbox", icon: "inbox" as const, href: "/inbox" },
];

const utilityItems = [
  { label: "Recherche globale", icon: "search" as const, href: "/search" },
  { label: "Éléments liés", icon: "link" as const, href: "/related" },
  { label: "Chief", icon: "spark" as const, href: "/chief" },
  { label: "Paramètres", icon: "settings" as const, href: "/settings" },
];

const mobileItems = [navItems[0], navItems[2], navItems[5]];
// These caches are only mutated in client events/effects; server rendering uses defaults.
let cachedExpanded: boolean | null = null;
let cachedPinnedIds: readonly DockToolId[] | null = null;

export function AppShell({ children }: Readonly<{ children: React.ReactNode }>) {
  const pathname = usePathname();
  const router = useRouter();
  const [expanded, setExpanded] = useState(() => cachedExpanded ?? false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [toolspaceOpen, setToolspaceOpen] = useState(false);
  const [pinnedIds, setPinnedIds] = useState<readonly DockToolId[]>(() => cachedPinnedIds ?? defaultPinnedTools);
  const {
    dockRef, side: dockSide, dragging: dockDragging, dockStyle,
    handlePointerDown, handlePointerMove, handlePointerUp, handlePointerCancel,
    handleKeyboardMove, resetPosition,
  } = useFloatingDock();
  const pinnedTools = dockTools.filter((tool) => pinnedIds.includes(tool.id));

  useEffect(() => {
    if (cachedPinnedIds !== null) return;
    const frame = window.requestAnimationFrame(() => {
      try {
        const saved: unknown = JSON.parse(window.localStorage.getItem("atlas:dock-pins-v1") ?? "null");
        if (Array.isArray(saved)) {
          const safePins = saved
            .filter((id): id is DockToolId => typeof id === "string" && dockTools.some((tool) => tool.id === id))
            .filter((id, index, all) => all.indexOf(id) === index)
            .slice(0, MAX_PINNED_TOOLS);
          cachedPinnedIds = safePins;
          setPinnedIds(safePins);
        } else {
          cachedPinnedIds = defaultPinnedTools;
        }
      } catch {
        cachedPinnedIds = defaultPinnedTools;
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  const togglePin = (id: DockToolId) => {
    setPinnedIds((current) => {
      const next = current.includes(id) ? current.filter((item) => item !== id) :
        current.length < MAX_PINNED_TOOLS ? [...current, id] : current;
      cachedPinnedIds = next;
      try { window.localStorage.setItem("atlas:dock-pins-v1", JSON.stringify(next)); } catch {}
      return next;
    });
  };

  const currentLabel = [...navItems, ...utilityItems].find((item) => item.href === pathname)?.label ?? "Atlas";

  useEffect(() => {
    if (cachedExpanded !== null) return;
    const restore = window.setTimeout(() => {
      try {
        const fromStorage = window.localStorage.getItem("atlas:dock-expanded") === "true";
        cachedExpanded = fromStorage;
        setExpanded(fromStorage);
      } catch {
        cachedExpanded = false;
      }
    }, 0);
    return () => window.clearTimeout(restore);
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
        setToolspaceOpen(false);
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
    setToolspaceOpen(false);
  };
  const toggleToolspace = () => {
    setMenuOpen(false);
    setToolspaceOpen((open) => !open);
  };
  const linkClass = (href: string) => "atlas-dock-link" + (pathname === href ? " atlas-dock-active" : "");

  return (
    <div data-dock-side={dockSide} className={"app-shell atlas-shell" + (expanded ? " atlas-expanded" : "") + (menuOpen ? " atlas-mobile-open" : "") + (dockDragging ? " atlas-dock-is-dragging" : "") + (toolspaceOpen ? " atlas-tools-open" : "")}>
      <a className="skip-link" href="#main-content">Aller au contenu principal</a>
      <header className="atlas-topbar">
        <div className="atlas-topbar-start">
          <button type="button" className="atlas-mobile-toggle" onClick={() => setMenuOpen((open) => !open)} aria-expanded={menuOpen} aria-label={menuOpen ? "Fermer le menu" : "Ouvrir le menu"}>
            <Icon name={menuOpen ? "close" : "menu"} />
          </button>
          <Link className="atlas-wordmark" href="/" onClick={closeMenu} aria-label="Atlas, accueil">
            <span className="atlas-mark" aria-hidden="true">A</span><span>Atlas</span>
          </Link>
          <span className="atlas-location"><span>/</span>{currentLabel}</span>
        </div>
        <Link className="atlas-search-trigger" href="/search" aria-label="Recherche globale">
          <Icon name="search" /><span>Rechercher une mission, un agent, une app...</span><kbd>⌘ K</kbd>
        </Link>
        <div className="atlas-topbar-end">
          <Link className="atlas-chief-shortcut" href="/chief"><Icon name="spark" /><span>Chief of Staff</span></Link>
          <Link className="atlas-notification-link" href="/inbox" aria-label="Ouvrir les demandes à traiter" title="Besoin de vous"><Icon name="inbox" /></Link>
          <div className="atlas-header-workspace"><WorkspaceSelector /></div>
        </div>
      </header>

      <aside ref={dockRef} style={dockStyle} className="atlas-dock atlas-smart-dock" aria-label="Navigation principale">
        <div className="atlas-dock-title">
          <button className="atlas-dock-grip" type="button"
            title="Déplacer le menu · Double-clic pour recentrer"
            aria-label="Déplacer le menu flottant"
            aria-describedby="atlas-dock-help"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerCancel}
            onKeyDown={handleKeyboardMove}
            onDoubleClick={resetPosition}>
            <Icon name="grip" />
            <span className="atlas-dock-title-text">ATLAS DOCK</span>
          </button>
          <span className="sr-only" id="atlas-dock-help">
            Utilisez la souris pour glisser le menu. Avec le clavier : flèches pour déplacer, Maj et flèche pour avancer plus vite, Origine ou Fin pour ajuster la hauteur.
          </span>
          <button className="atlas-expand-toggle" type="button" onClick={toggleExpanded}
            aria-label={expanded ? "Réduire le menu" : "Agrandir le menu"}
            title={expanded ? "Réduire le menu" : "Agrandir le menu"} aria-expanded={expanded}>
            <Icon name={expanded ? (dockSide === "left" ? "chevron-left" : "chevron-right") : (dockSide === "left" ? "chevron-right" : "chevron-left")} />
          </button>
        </div>
        <div className="atlas-dock-identity" aria-hidden="true"><span>A</span><i /></div>
        <nav className="atlas-dock-nav" aria-label="Sections principales">
          {navItems.map((item) => (
            <Link key={item.href} href={item.href} title={item.label} aria-label={item.label}
              className={linkClass(item.href)} aria-current={pathname === item.href ? "page" : undefined}
              onClick={closeMenu}>
              <Icon name={item.icon} /><span className="atlas-dock-label">{item.label}</span>
            </Link>
          ))}
        </nav>
        <div className="atlas-dock-separator" />
        <div className="atlas-dock-tools-section">
          <span className="atlas-dock-section-name">OUTILS RAPIDES</span>
          <button type="button" className={"atlas-dock-tool-toggle" + (toolspaceOpen ? " is-open" : "")}
            onClick={toggleToolspace}
            aria-label={toolspaceOpen ? "Fermer l'espace d'outils" : "Ouvrir l'espace d'outils"}
            aria-expanded={toolspaceOpen} aria-controls="atlas-dock-toolspace"
            title="Espace d'outils et agents">
            <Icon name="spark" />
            <span className="atlas-dock-label">Outils & agents</span>
            <span className="atlas-dock-tool-toggle-plus" aria-hidden="true">{toolspaceOpen ? "−" : "+"}</span>
          </button>
          <nav className="atlas-dock-nav atlas-dock-pins" aria-label="Outils épinglés">
            {pinnedTools.map((tool) => (
              <Link key={tool.id} href={tool.href} onClick={closeMenu} title={tool.name} aria-label={"Outil rapide : " + tool.name}
                className={"atlas-dock-link atlas-dock-pin-link" + (pathname === tool.href ? " atlas-dock-active" : "")}>
                <Icon name={tool.icon} />
                <span className="atlas-dock-label">{tool.name}</span>
              </Link>
            ))}
          </nav>
        </div>
        <div className="atlas-dock-separator" />
        <nav className="atlas-dock-nav atlas-dock-utilities" aria-label="Outils transversaux">
          {utilityItems.map((item) => (
            <Link key={item.href} href={item.href} title={item.label} aria-label={item.label}
              className={linkClass(item.href)} aria-current={pathname === item.href ? "page" : undefined}
              onClick={closeMenu}>
              <Icon name={item.icon} /><span className="atlas-dock-label">{item.label}</span>
            </Link>
          ))}
        </nav>
        <div className="atlas-dock-account">
          <SessionControls />
          <button className="atlas-dock-reset" type="button" onClick={resetPosition} title="Remettre le dock au centre-gauche">
            <Icon name="rotate-ccw" /> Recentrer le dock
          </button>
        </div>
      </aside>
      {toolspaceOpen && !dockDragging && (
        <DockToolspace
          onClose={() => setToolspaceOpen(false)}
          onNavigate={closeMenu}
          pinnedIds={pinnedIds}
          onTogglePin={togglePin}
        />
      )}
      {toolspaceOpen && <button type="button" className="atlas-toolspace-mobile-scrim" onClick={() => setToolspaceOpen(false)} aria-label="Fermer l'espace d'outils" />}
      {dockDragging && <div className="atlas-dock-dropguides" aria-hidden="true">
        <span className="atlas-dock-dropguide atlas-dock-dropguide-left">Gauche</span>
        <span className="atlas-dock-dropguide atlas-dock-dropguide-right">Droite</span>
      </div>}
      {menuOpen && <button className="atlas-dock-scrim" type="button" aria-label="Fermer le menu" onClick={closeMenu} />}
      <div className="atlas-main-frame">{children}</div>
      <nav className="mobile-bottom-nav atlas-mobile-bottom" aria-label="Navigation rapide">
        {mobileItems.map((item) => (
          <Link key={item.href} href={item.href} className={"mobile-nav-item" + (pathname === item.href ? " mobile-nav-active" : "")}
            aria-current={pathname === item.href ? "page" : undefined} onClick={closeMenu}>
            <Icon name={item.icon} /><span>{item.label}</span>
          </Link>
        ))}
        <button className={"mobile-nav-item" + (toolspaceOpen ? " mobile-nav-active" : "")} type="button"
          aria-expanded={toolspaceOpen} aria-controls="atlas-dock-toolspace" onClick={toggleToolspace}>
          <Icon name="spark" /><span>Outils</span>
        </button>
      </nav>
    </div>
  );
}
