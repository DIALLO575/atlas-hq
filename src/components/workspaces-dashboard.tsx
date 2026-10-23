"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { createWorkspaceFromForm } from "@/app/workspaces/actions";
import { Icon } from "@/components/icon";
import type { Workspace } from "@/lib/workspaces/contract";

type RoleFilter = "all" | "managed" | "member";

const roleLabels: Record<Workspace["role"], string> = {
  owner: "Propriétaire",
  admin: "Administrateur",
  member: "Membre",
};

const roleDescriptions: Record<Workspace["role"], string> = {
  owner: "Vous êtes propriétaire de cet espace.",
  admin: "Vous pouvez administrer cet espace.",
  member: "Vous faites partie de cet espace.",
};

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("fr");
}

function CreateWorkspaceSubmit() {
  const { pending } = useFormStatus();
  return (
    <button className="atlas-workspaces-create-submit" type="submit" disabled={pending}>
      <Icon name="layers" /> {pending ? "Création en cours…" : "Créer mon espace"} <Icon name="arrow-right" />
    </button>
  );
}

export function WorkspacesDashboard({
  workspaces,
  createError,
}: {
  workspaces: Workspace[];
  createError: boolean;
}) {
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");
  const managed = workspaces.filter((workspace) => workspace.role !== "member").length;
  const member = workspaces.filter((workspace) => workspace.role === "member").length;

  const filtered = useMemo(() => {
    const term = normalize(search.trim());
    return workspaces.filter((workspace) => {
      const byRole = roleFilter === "all" ||
        (roleFilter === "managed" ? workspace.role !== "member" : workspace.role === "member");
      return byRole && (!term || normalize(workspace.name).includes(term));
    });
  }, [workspaces, search, roleFilter]);

  return (
    <>
      <section className="atlas-workspaces-stats" aria-label="Résumé de vos accès">
        <div className="atlas-workspaces-stat">
          <span className="atlas-workspaces-stat-symbol"><Icon name="layers" /></span>
          <div><strong>{workspaces.length}</strong><span>Espaces accessibles</span></div>
        </div>
        <div className="atlas-workspaces-stat">
          <span className="atlas-workspaces-stat-symbol is-violet"><Icon name="settings" /></span>
          <div><strong>{managed}</strong><span>Espaces administrés</span></div>
        </div>
        <div className="atlas-workspaces-stat">
          <span className="atlas-workspaces-stat-symbol is-blue"><Icon name="bot" /></span>
          <div><strong>{member}</strong><span>Espaces en tant que membre</span></div>
        </div>
      </section>

      <div className="atlas-workspaces-layout">
        <section className="atlas-workspaces-collection" aria-labelledby="atlas-workspaces-list-heading">
          <div className="atlas-workspaces-section-head">
            <div>
              <h2 id="atlas-workspaces-list-heading">Mes workspaces</h2>
              <p>Les espaces auxquels votre compte a réellement accès.</p>
            </div>
            <span className="atlas-workspaces-total" role="status" aria-live="polite">
              {filtered.length} espace{filtered.length > 1 ? "s" : ""}
            </span>
          </div>

          <div className="atlas-workspaces-controls">
            <div className="atlas-workspaces-filters" role="group" aria-label="Filtrer par rôle">
              {([
                ["all", "Tous"],
                ["managed", "Administration"],
                ["member", "Membre"],
              ] as const).map(([value, label]) => (
                <button key={value} type="button" aria-pressed={roleFilter === value}
                  className={roleFilter === value ? "is-active" : ""}
                  onClick={() => setRoleFilter(value)}>{label}</button>
              ))}
            </div>
            <div className="atlas-workspaces-search" role="search">
              <Icon name="search" />
              <label className="sr-only" htmlFor="atlas-workspaces-search">Rechercher un workspace</label>
              <input id="atlas-workspaces-search" type="search" value={search} onChange={(event) => setSearch(event.target.value)}
                placeholder="Rechercher un espace…" autoComplete="off" />
              {search && <button type="button" aria-label="Effacer la recherche" onClick={() => setSearch("")}><Icon name="close" /></button>}
            </div>
          </div>

          {filtered.length ? (
            <div className="atlas-workspaces-grid">
              {filtered.map((workspace, index) => (
                <article className="atlas-workspace-card" key={workspace.id}>
                  <div className="atlas-workspace-card-top">
                    <span className={"atlas-workspace-monogram atlas-workspace-tone-" + (index % 4)}>
                      {workspace.name.trim().slice(0, 1).toLocaleUpperCase("fr") || "A"}
                    </span>
                    <span className={"atlas-workspace-role atlas-workspace-role-" + workspace.role}>{roleLabels[workspace.role]}</span>
                  </div>
                  <h3 title={workspace.name}>{workspace.name}</h3>
                  <p>{roleDescriptions[workspace.role]}</p>
                  <div className="atlas-workspace-card-bottom">
                    <span><span className="atlas-workspace-access-dot" /> Accès vérifié</span>
                    <Link href="/apps" aria-label={"Explorer les applications disponibles dans Atlas depuis " + workspace.name}>
                      Catalogue d’apps <Icon name="arrow-up-right" />
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="atlas-workspaces-empty">
              <span><Icon name="layers" /></span>
              <h3>{workspaces.length === 0 ? "Votre premier espace commence ici" : "Aucun workspace trouvé"}</h3>
              <p>{workspaces.length === 0
                ? "Créez un workspace pour organiser vos projets et préparer les connexions de vos agents."
                : "Essayez un autre nom ou sélectionnez un autre filtre."}</p>
              {workspaces.length === 0 ? (
                <a href="#create-workspace">Créer mon premier espace <Icon name="arrow-right" /></a>
              ) : (
                <button type="button" onClick={() => { setSearch(""); setRoleFilter("all"); }}>Effacer les filtres</button>
              )}
            </div>
          )}
        </section>

        <aside className="atlas-workspaces-create" id="create-workspace" aria-labelledby="atlas-workspaces-create-heading">
          <div className="atlas-workspaces-create-top">
            <span><Icon name="layers" /></span>
            <div>
              <p className="atlas-overline">NOUVEL ESPACE</p>
              <h2 id="atlas-workspaces-create-heading">Créer un workspace</h2>
            </div>
          </div>
          <p className="atlas-workspaces-create-lead">Un nouvel espace pour collaborer et organiser vos prochaines missions.</p>

          {createError && <p className="atlas-workspaces-form-error" role="alert">
            La création n’a pas abouti. Vérifiez le nom et réessayez.
          </p>}

          <form action={createWorkspaceFromForm} className="atlas-workspaces-form">
            <label htmlFor="new-workspace-name">Nom du workspace</label>
            <input id="new-workspace-name" name="name" required minLength={1} maxLength={120}
              placeholder="Ex. Équipe Atlas" autoComplete="off" />
            <p>De 1 à 120 caractères. Vous serez propriétaire de l’espace créé.</p>
            <CreateWorkspaceSubmit />
          </form>

          <div className="atlas-workspaces-create-footnote">
            <Icon name="link" />
            <p>Chaque workspace possède ses propres autorisations. Seuls les membres habilités peuvent y accéder.</p>
          </div>
        </aside>
      </div>
    </>
  );
}
