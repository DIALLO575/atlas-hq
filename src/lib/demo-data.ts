export const demoApps = [
  { name: "Notion", description: "Vos espaces de travail et documents", mark: "N", tone: "notion" },
  { name: "GitHub", description: "Code source et projets", mark: "GH", tone: "github" },
  { name: "Linear", description: "Tâches et suivi de projets", mark: "L", tone: "linear" },
  { name: "OpenMausBot", description: "Vos assistants et conversations", mark: "◎", tone: "maus" },
  { name: "Google Calendar", description: "Calendriers et événements", mark: "G", tone: "calendar" },
];

export const searchableItems = [
  ...demoApps.map((app) => ({ title: app.name, detail: app.description, type: "Application", href: "/apps" })),
  { title: "Agents", detail: "Consultez les agents disponibles dans votre espace", type: "Section", href: "/agents" },
  { title: "Vue d’ensemble", detail: "Retrouvez les repères du cockpit", type: "Section", href: "/" },
];
