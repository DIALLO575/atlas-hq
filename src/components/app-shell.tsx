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
  const [menuOpen, setMenuOpen] = useState(false);
  const currentLabel = [...navItems, ...utilityItems].find((item) => item.href === pathname)?.label ?? "ATLAS HQ";

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setMenuOpen(false);
        router.push("/search");
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [router]);

  const closeMenu = () => setMenuOpen(false);
  const linkClass = (href: string) => `nav-item ${pathname === href ? "nav-active" : ""}`;

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">Aller au contenu principal</a>
      <aside className={`sidebar ${menuOpen ? "sidebar-open" : ""}`} aria-label="Navigation principale">
        <Link className="brand" href="/" aria-label="ATLAS HQ, accueil" onClick={closeMenu}>
          <span className="brand-symbol">A</span>
          <span>ATLAS<span className="brand-light">HQ</span><small>PERSONAL OPERATING SYSTEM</small></span>
        </Link>
        <WorkspaceSelector />
        <div className="nav-label">ESPACE DE TRAVAIL</div>
        <nav className="primary-nav" aria-label="Sections principales">
          {navItems.map((item) => <Link key={item.href} className={linkClass(item.href)} href={item.href} aria-current={pathname === item.href ? "page" : undefined} onClick={closeMenu}><Icon name={item.icon}/><span>{item.label}</span></Link>)}
        </nav>
        <div className="sidebar-bottom">
          <div className="nav-label utility-label">ACCÈS TRANSVERSAUX</div>
          <nav className="utility-nav" aria-label="Outils transversaux">
            {utilityItems.map((item) => <Link key={item.href} className={linkClass(item.href)} href={item.href} aria-current={pathname === item.href ? "page" : undefined} onClick={closeMenu}><Icon name={item.icon}/><span>{item.label}</span></Link>)}
          </nav>
          <SessionControls />
        </div>
      </aside>
      {menuOpen && <button className="sidebar-scrim" aria-label="Fermer le menu" onClick={closeMenu} />}
      <div className="app-column">
        <header className="topbar">
          <button className="mobile-menu icon-button" onClick={() => setMenuOpen((open) => !open)} aria-label={menuOpen ? "Fermer le menu" : "Ouvrir le menu"} aria-expanded={menuOpen}><Icon name={menuOpen ? "close" : "menu"}/></button>
          <div className="breadcrumb"><span>ATLAS HQ</span><span className="crumb-slash" aria-hidden="true">/</span><strong>{currentLabel}</strong></div>
          <div className="topbar-actions">
            <Link className="global-search icon-button" href="/search" aria-label="Recherche globale"><Icon name="search"/><span>Rechercher</span><kbd>⌘ K</kbd></Link>
            <span className="system-status"><span className="status-dot"/>Espace protégé</span>
          </div>
        </header>
        {children}
      </div>
      <nav className="mobile-bottom-nav" aria-label="Navigation rapide">
        {mobileItems.map((item) => <Link key={item.href} className={`mobile-nav-item ${pathname === item.href ? "mobile-nav-active" : ""}`} href={item.href} aria-current={pathname === item.href ? "page" : undefined} onClick={closeMenu}><Icon name={item.icon}/><span>{item.label}</span></Link>)}
        <button className={`mobile-nav-item ${menuOpen ? "mobile-nav-active" : ""}`} type="button" aria-expanded={menuOpen} onClick={() => setMenuOpen((open) => !open)}><Icon name={menuOpen ? "close" : "menu"}/><span>Menu</span></button>
      </nav>
    </div>
  );
}
