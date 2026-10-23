/** Visual directory only. Entries are not evidence of a live integration. */
export const appCategories = ["Toutes", "Productivité", "Développement", "Communication", "Données", "CRM", "Design"] as const;

export type AppCategory = Exclude<(typeof appCategories)[number], "Toutes">;

export const atlasApps: ReadonlyArray<{
  slug: string;
  name: string;
  category: AppCategory;
  description: string;
}> = [
  { slug: "notion", name: "Notion", category: "Productivité", description: "Documents et connaissances de votre équipe." },
  { slug: "github", name: "GitHub", category: "Développement", description: "Dépôts, code et suivi des projets." },
  { slug: "linear", name: "Linear", category: "Développement", description: "Projets, issues et suivi des missions." },
  { slug: "slack", name: "Slack", category: "Communication", description: "Échanges et notifications d’équipe." },
  { slug: "google-drive", name: "Google Drive", category: "Productivité", description: "Fichiers partagés et ressources." },
  { slug: "google-calendar", name: "Google Calendar", category: "Productivité", description: "Réunions et événements à coordonner." },
  { slug: "google-sheets", name: "Google Sheets", category: "Données", description: "Feuilles de calcul et données métier." },
  { slug: "airtable", name: "Airtable", category: "Données", description: "Bases et workflows collaboratifs." },
  { slug: "salesforce", name: "Salesforce", category: "CRM", description: "Clients, relations et opportunités." },
  { slug: "google-analytics", name: "Google Analytics", category: "Données", description: "Audience et mesures d’activité." },
  { slug: "microsoft-365", name: "Microsoft 365", category: "Productivité", description: "Documents et outils de travail." },
  { slug: "figma", name: "Figma", category: "Design", description: "Design produit et collaboration." },
];
