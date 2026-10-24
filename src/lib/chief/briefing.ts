import type { AtlasMission, AtlasReview } from "@/lib/atlas-workflow";

export type ChiefIntent = "briefing" | "missions" | "decisions" | "activity" | "github" | "help";
export type ChiefCardMission = Pick<AtlasMission, "id" | "title" | "status" | "priority" | "updatedAt">;
export type ChiefCardReview = Pick<AtlasReview, "id" | "title" | "createdAt" | "decision">;
export type ChiefReply = {
  intent: ChiefIntent; text: string; source: string; workspaceName: string;
  counts: { total: number; active: number; review: number; done: number; planned: number; pendingDecisions: number };
  missions: ChiefCardMission[]; reviews: ChiefCardReview[];
  chart: { label: string; value: number }[]; limited: boolean;
};

const plain = (text: string) => text.toLocaleLowerCase("fr").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
export function classifyChiefPrompt(raw: string): ChiefIntent {
  const text = plain(raw);
  if (/\b(github|depots?|repos?|pull requests?|pulls?|prs?|codes?|commits?)\b/.test(text)) return "github";
  if (/\b(inbox|decisions?|valider|validations?|approbations?|approuver|refuser|attentes?)\b/.test(text)) return "decisions";
  if (/\b(graphiques?|activites?|evolutions?|statistiques?|tendances?|repartitions?)\b/.test(text)) return "activity";
  if (/\b(fais le point|point sur|briefings?|bilans?|resumes?|syntheses?|tableau de bord)\b/.test(text)) return "briefing";
  if (/\b(missions?|priorites?|taches?|projets?|objectifs?)\b/.test(text)) return "missions";
  if (/\b(aujourd.hui|semaines?|ensemble)\b/.test(text)) return "briefing";
  return "help";
}
export function buildChiefReply(question: string, workspaceName: string, missions: AtlasMission[],
  reviews: AtlasReview[], userId: string, canDecide: boolean): ChiefReply {
  const intent = classifyChiefPrompt(question);
  const counts = {
    total: missions.length,
    active: missions.filter(m => m.status === "active").length,
    review: missions.filter(m => m.status === "review").length,
    done: missions.filter(m => m.status === "done").length,
    planned: missions.filter(m => m.status === "planned").length,
    pendingDecisions: canDecide ? reviews.filter(r => r.decision === "pending").length : 0,
  };
  const pending = reviews.filter(r => r.decision === "pending");
  const selectedMissions = [...missions].sort((a,b) => Number(b.priority === "high") - Number(a.priority === "high"))
    .slice(0,5).map(({id,title,status,priority,updatedAt}) => ({id,title,status,priority,updatedAt}));
  const selectedReviews = pending.filter(r => canDecide || r.requestedBy === userId)
    .slice(0,4).map(({id,title,createdAt,decision}) => ({id,title,createdAt,decision}));
  const chart = [
    {label:"À lancer",value:counts.planned}, {label:"En cours",value:counts.active},
    {label:"À valider",value:counts.review}, {label:"Terminées",value:counts.done},
  ];
  const summary = counts.total
    ? counts.total + " missions visibles : " + counts.active + " en cours, " + counts.review + " en validation et " + counts.done + " terminées."
    : "Il n’y a pas encore de mission enregistrée dans cet espace.";
  const sentences: Record<ChiefIntent,string> = {
    briefing: summary + " " + (canDecide
      ? counts.pendingDecisions + " demande(s) attendent votre décision."
      : "Les décisions d’administration sont réservées aux responsables du workspace.")
      + " Voici votre briefing issu des données Atlas.",
    missions: summary + " Vous pouvez ouvrir les missions pour consulter ou modifier leur état.",
    decisions: canDecide
      ? counts.pendingDecisions + " demande(s) à traiter dans Inbox."
      : selectedReviews.length + " demande(s) envoyées encore en attente.",
    activity: "Voici la répartition actuelle de vos " + counts.total +
      " missions par statut. Il ne s’agit pas d’une série d’évolution historique.",
    github: "Le panneau GitHub consulte vos installations et dépôts autorisés grâce au connecteur sécurisé. Aucune PR n’est inventée.",
    help: "Je peux présenter vos missions, validations, leur répartition et le contexte GitHub. La conversation libre avec un modèle IA n’est pas encore connectée.",
  };
  return {intent,text:sentences[intent],workspaceName,counts,missions:selectedMissions,
    reviews:selectedReviews,chart,source:"ATLAS · Missions et Inbox",
    limited:missions.length >= 200 || reviews.length >= 200};
}
