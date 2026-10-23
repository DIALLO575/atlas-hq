"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Icon } from "@/components/icon";
import { SessionControls } from "@/components/session-controls";
import { WorkspaceSelector } from "@/components/workspace-selector";

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

export function AppShell({ children }: Readonly<{ children: React.ReactNode }>) {
  const pathname = usePathname();
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const currentLabel = [...navItems, ...utilityItems].find((item) => item.href === pathname)?.label ?? "Atlas";

  useEffect(() => {
    const restore = window.setTimeout(() => {
      try {
        setExpanded(window.localStorage.getItem("atlas:dock-expanded") === "true");
      } catch {
        // Storage may be unavailable in restricted browsing environments.
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
      if (event.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [router]);

  const toggleExpanded = () => {
    setExpanded((current) => {
      const next = !current;
      try { window.localStorage.setItem("atlas:dock-expanded", String(next)); } catch {}
      return next;
    });
  };
  const closeMenu = () => setMenuOpen(false);
  const linkClass = (href: string) => "atlas-dock-link" + (pathname === href ? " atlas-dock-active" : "");

  return (
    <div className={"app-shell atlas-shell" + (expanded ? " atlas-expanded" : "") + (menuOpen ? " atlas-mobile-open" : "")}>
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

      <aside className="atlas-dock" aria-label="Navigation principale">
        <div className="atlas-dock-title">
          <span className="atlas-dock-title-text">NAVIGATION</span>
          <button className="atlas-expand-toggle" type="button" onClick={toggleExpanded}
            aria-label={expanded ? "Réduire le menu" : "Agrandir le menu"}
            title={expanded ? "Réduire le menu" : "Agrandir le menu"} aria-expanded={expanded}>
            <Icon name="layers" />
          </button>
        </div>
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
        <nav className="atlas-dock-nav atlas-dock-utilities" aria-label="Outils transversaux">
          {utilityItems.map((item) => (
            <Link key={item.href} href={item.href} title={item.label} aria-label={item.label}
              className={linkClass(item.href)} aria-current={pathname === item.href ? "page" : undefined}
              onClick={closeMenu}>
              <Icon name={item.icon} /><span className="atlas-dock-label">{item.label}</span>
            </Link>
          ))}
        </nav>
        <div className="atlas-dock-account"><SessionControls /></div>
      </aside>
      {menuOpen && <button className="atlas-dock-scrim" type="button" aria-label="Fermer le menu" onClick={closeMenu} />}
      <div className="atlas-main-frame">{children}</div>
      <nav className="mobile-bottom-nav atlas-mobile-bottom" aria-label="Navigation rapide">
        {mobileItems.map((item) => (
          <Link key={item.href} href={item.href} className={"mobile-nav-item" + (pathname === item.href ? " mobile-nav-active" : "")}
            aria-current={pathname === item.href ? "page" : undefined} onClick={closeMenu}>
            <Icon name={item.icon} /><span>{item.label}</span>
          </Link>
        ))}
        <button className={"mobile-nav-item" + (menuOpen ? " mobile-nav-active" : "")} type="button"
          aria-expanded={menuOpen} onClick={() => setMenuOpen((open) => !open)}>
          <Icon name={menuOpen ? "close" : "menu"} /><span>Menu</span>
        </button>
      </nav>
    </div>
  );
}
