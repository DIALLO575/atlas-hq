"use client";

import Link from "next/link";
import { useState } from "react";
import { Icon } from "@/components/icon";

const navItems = [
  { label: "Vue d’ensemble", icon: "grid" as const, href: "#main-content", active: true },
  { label: "Mes espaces", icon: "layers" as const, href: "#espaces", active: false },
  { label: "Activité", icon: "activity" as const, href: "#main-content", active: false },
];

export function AppShell({ children }: Readonly<{ children: React.ReactNode }>) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">Aller au contenu principal</a>
      <aside className={`sidebar ${menuOpen ? "sidebar-open" : ""}`} aria-label="Navigation principale">
        <Link className="brand" href="#main-content" aria-label="ATLAS HQ, accueil"><span className="brand-symbol">A</span><span>ATLAS<span className="brand-light">HQ</span><small>PERSONAL OPERATING SYSTEM</small></span></Link>
        <div className="workspace-switch"><span className="workspace-avatar">M</span><span><strong>Espace personnel</strong><small>Personal Operating System</small></span><span className="switch-chevron">⌄</span></div>
        <div className="nav-label">ESPACE DE TRAVAIL</div>
        <nav className="primary-nav">
          {navItems.map((item) => <a key={item.label} className={`nav-item ${item.active ? "nav-active" : ""}`} href={item.href} onClick={() => setMenuOpen(false)}><Icon name={item.icon}/><span>{item.label}</span></a>)}
        </nav>
        <div className="sidebar-bottom"><div className="sidebar-help"><span className="help-orb">?</span><span><strong>Besoin d’aide ?</strong><small>Découvrez le guide de démarrage</small></span><Icon name="arrow-up-right" /></div><a className="nav-item settings-item" href="#main-content"><Icon name="settings"/><span>Paramètres</span></a><div className="profile-row"><div className="profile-avatar">MD</div><span><strong>Mamadou Diallo</strong><small>Compte personnel</small></span><span className="profile-menu">···</span></div></div>
      </aside>
      {menuOpen && <button className="sidebar-scrim" aria-label="Fermer le menu" onClick={() => setMenuOpen(false)} />}
      <div className="app-column">
        <header className="topbar"><button className="mobile-menu icon-button" onClick={() => setMenuOpen(true)} aria-label="Ouvrir le menu"><Icon name="menu" /></button><div className="breadcrumb"><span>Mon espace</span><span className="crumb-slash">/</span><strong>Vue d’ensemble</strong></div><div className="topbar-actions"><span className="system-status">Aucune connexion active</span><button className="avatar-button" aria-label="Menu du compte">MD</button></div></header>
        {children}
      </div>
    </div>
  );
}
