/** Directory metadata only. This catalog does not imply working OAuth connections. */
export const appCategories = ["Toutes", "Productivité", "Développement", "Communication", "Données", "CRM", "Design"] as const;

export type AppCategory = Exclude<(typeof appCategories)[number], "Toutes">;

export type CatalogApp = {
  slug: string;
  name: string;
  category: AppCategory;
  description: string;
  useCase: string;
  recommended?: boolean;
};

export const atlasApps: ReadonlyArray<CatalogApp> = [
  { slug: "notion", name: "Notion", category: "Productivité", description: "Docs, wikis et projets", useCase: "Retrouver les connaissances et le contexte des projets." },
  { slug: "slack", name: "Slack", category: "Communication", description: "Messages et collaboration", useCase: "Suivre les échanges d'équipe et repérer les sujets importants." },
  { slug: "github", name: "GitHub", category: "Développement", description: "Code et dépôts", useCase: "Relier les changements de code aux missions et aux agents." },
  { slug: "google-drive", name: "Google Drive", category: "Productivité", description: "Fichiers et documents", useCase: "Centraliser les documents utilisés pendant les missions." },
  { slug: "figma", name: "Figma", category: "Design", description: "Design et prototypes", useCase: "Conserver le contexte des maquettes et de la conception." },
  { slug: "linear", name: "Linear", category: "Développement", description: "Projets et tâches", useCase: "Donner de la visibilité sur les issues et leurs priorités." },
  { slug: "airtable", name: "Airtable", category: "Données", description: "Bases de données", useCase: "Organiser des bases et des processus collaboratifs." },
  { slug: "salesforce", name: "Salesforce", category: "CRM", description: "Clients et opportunités", useCase: "Suivre les comptes, les contacts et les opportunités." },
  { slug: "google-calendar", name: "Google Calendar", category: "Productivité", description: "Agenda et réunions", useCase: "Coordonner événements, échéances et réunions." },
  { slug: "google-sheets", name: "Google Sheets", category: "Données", description: "Tableurs et rapports", useCase: "Consulter des tableaux et des indicateurs d'activité." },
  { slug: "google-analytics", name: "Google Analytics", category: "Données", description: "Audience et analyses", useCase: "Retrouver les tendances des données d'audience." },
  { slug: "microsoft-365", name: "Microsoft 365", category: "Productivité", description: "Bureautique et fichiers", useCase: "Relier les documents et les outils de travail." },
  { slug: "miro", name: "Miro", category: "Productivité", description: "Tableaux collaboratifs", useCase: "Transformer des ateliers en actions pour les missions.", recommended: true },
  { slug: "microsoft-teams", name: "Microsoft Teams", category: "Communication", description: "Réunions et discussions", useCase: "Suivre les échanges et réunions de votre équipe.", recommended: true },
  { slug: "calendly", name: "Calendly", category: "Productivité", description: "Prise de rendez-vous", useCase: "Organiser des rendez-vous avec moins d'allers-retours.", recommended: true },
  { slug: "hubspot", name: "HubSpot", category: "CRM", description: "Marketing et CRM", useCase: "Suivre les interactions et le parcours client.", recommended: true },
  { slug: "zapier", name: "Zapier", category: "Productivité", description: "Automatisations", useCase: "Relier différentes tâches dans des scénarios d'automatisation." },
  { slug: "clickup", name: "ClickUp", category: "Développement", description: "Gestion de projets", useCase: "Structurer tâches et livrables de l'équipe." },
];

export const recommendedApps = atlasApps.filter((app) => app.recommended);
