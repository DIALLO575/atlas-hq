/**
 * Atlas Dock shortcuts are local navigation only.
 * This catalog does not grant agents permission to run an external action.
 * Execution requires a server-side connector, workspace authorization and approval policy.
 */
export const dockTools = [
  { id: "search", name: "Recherche", description: "Retrouver une mission, une app ou un agent.", href: "/search", icon: "search", category: "Explorer" },
  { id: "chief", name: "Chief of Staff", description: "Ouvrir votre espace de coordination IA.", href: "/chief", icon: "spark", category: "Agents" },
  { id: "inbox", name: "Approbations", description: "Voir les éléments qui demandent votre décision.", href: "/inbox", icon: "inbox", category: "Décisions" },
  { id: "missions", name: "Missions", description: "Accéder aux missions et aux priorités.", href: "/missions", icon: "activity", category: "Explorer" },
  { id: "agents", name: "Agents IA", description: "Voir les assistants de votre espace.", href: "/agents", icon: "bot", category: "Agents" },
  { id: "apps", name: "Mes applications", description: "Explorer les intégrations disponibles.", href: "/apps", icon: "apps", category: "Explorer" },
  { id: "workspaces", name: "Workspaces", description: "Accéder à vos espaces de travail.", href: "/workspaces", icon: "layers", category: "Explorer" },
] as const;

export type DockToolId = (typeof dockTools)[number]["id"];
export const defaultPinnedTools: readonly DockToolId[] = ["search", "chief"];
export const MAX_PINNED_TOOLS = 3;

export const integrationExamples = [
  { slug: "github", name: "GitHub", description: "Code et dépôts" },
  { slug: "notion", name: "Notion", description: "Documents et notes" },
  { slug: "google-calendar", name: "Google Calendar", description: "Événements et agenda" },
] as const;
