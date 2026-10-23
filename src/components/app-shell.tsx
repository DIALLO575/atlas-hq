"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Icon } from "@/components/icon";
import { signOut } from "@/app/login/actions";

const navItems = [
  { label: "Vue d’ensemble", icon: "grid" as const, href: "/" },
  { label: "Mes Apps", icon: "layers" as const, href: "/apps" },
  { label: "Agents", icon: "bot" as const, href: "/agents" },
  { label: "Recherche", icon: "search" as const, href: "/search" },
];

export function AppShell({ children }: Readonly<{ children: React.ReactNode }>) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">Aller au contenu principal</a>
      <aside className={`sidebar ${menuOpen ? "sidebar-open" : ""}`} aria-label="Navigation principale">
        <Link className="brand" href="/" aria-label="ATLAS HQ, accueil" onClick={() => setMenuOpen(false)}><span className="brand-symbol">A</span><span>ATLAS<span className="brand-light">HQ</span><small>PERSONAL OPERATING SYSTEM</small></span></Link>
        <div className="workspace-switch"><span className="workspace-avatar">M</span><span><strong>Espace personnel</strong><small>Personal Operating System</small></span><span className="switch-chevron" aria-hidden="true">⌄</span></div>
        <div className="nav-label">ESPACE DE TRAVAIL</div>
        <nav className="primary-nav" aria-label="Sections">
          {navItems.map((item) => {
            const active = pathname === item.href;
            return <Link key={item.href} className={`nav-item ${active ? "nav-active" : ""}`} href={item.href} aria-current={active ? "page" : undefined} onClick={() => setMenuOpen(false)}><Icon name={item.icon}/><span>{item.label}</span></Link>;
          })}
        </nav>
        <div className="sidebar-bottom"><div className="sidebar-help"><span className="help-orb" aria-hidden="true">?</span><span><strong>Besoin d’aide ?</strong><small>Découvrez le guide de démarrage</small></span><Icon name="arrow-up-right" /></div><Link className="nav-item settings-item" href="/" aria-label="Paramètres, bientôt disponibles"><Icon name="settings"/><span>Paramètres · bientôt</span></Link><div className="profile-row"><div className="profile-avatar" aria-hidden="true">AT</div><span><strong>Compte connecté</strong><small>Session sécurisée</small></span><form action={signOut}><button className="profile-menu" type="submit" aria-label="Se déconnecter" title="Se déconnecter">↪</button></form></div></div>
      </aside>
      {menuOpen && <button className="sidebar-scrim" aria-label="Fermer le menu" onClick={() => setMenuOpen(false)} />}
      <div className="app-column">
        <header className="topbar"><button className="mobile-menu icon-button" onClick={() => setMenuOpen((open) => !open)} aria-label={menuOpen ? "Fermer le menu" : "Ouvrir le menu"} aria-expanded={menuOpen}><Icon name={menuOpen ? "close" : "menu"} /></button><div className="breadcrumb"><span>Mon espace</span><span className="crumb-slash" aria-hidden="true">/</span><strong>{navItems.find((item) => item.href === pathname)?.label ?? "Espace de travail"}</strong></div><div className="topbar-actions"><span className="system-status"><span className="status-dot" /> Mode démo · aucune connexion active</span><span className="avatar-button" aria-label="Compte personnel">MD</span></div></header>
        {children}
      </div>
    </div>
  );
}
