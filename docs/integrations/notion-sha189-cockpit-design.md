# SHA-189 — ATLAS HQ Notion V2 : design avant déploiement

**Code candidat seulement.** Le cockpit présente les primitives SHA-183/184/186/187/188 dans une interface responsive, sans données fictives. Aucun OAuth Notion via ATLAS, aucune mise en production.

## Expérience utilisateur
1. Sans connexion : état d'accueil honnête, types de contenus pris en charge et lien vers la gestion des autorisations. Aucun aperçu fictif ni statut « connecté » déduit des seules variables d'environnement.
2. Bibliothèque : recherche par titre Notion seulement, filtres locaux Tout / Pages / Bases / Sources appliqués aux résultats déjà chargés, compte explicite et navigation par sélection. Pas de nouvelle requête fournisseur déclenchée par un filtre local.
3. Page : onglets Document enrichi et Markdown filtré. Le Markdown est lu uniquement sur demande, sans HTML fournisseur exécuté et sans URL signée dans le JSON. Comptes des blocs et médias déjà chargés, pagination manuelle, avertissement de contenu incomplet.
4. Fichiers : cartes Image/PDF/Audio/Vidéo/Fichier, contrôles audio/vidéo sur petits médias, liens de consultation/téléchargement contrôlés. Le proxy Notion reste limité à **4 Mo et 8 secondes** ; au-delà, ouvrir l'original chez Notion. Pas de faux lecteur Office.
5. Data sources : aperçu tabulaire avec colonnes typées et scroll horizontal explicite, statuts visibles, résultats limités à 12 lignes/page. Les relations affichent des comptes, pas des IDs.
6. Vues natives : cartes avec type et indicateurs de filtres/tris/grouping du fournisseur ; accès à la vraie vue Notion. Le rendu n'imite pas un Kanban, calendrier ou galerie natif complet.
7. Accessibilité : états de chargement/absence/partiel, focus visibles, aria-label/aria-pressed, règles de mouvement réduit, grilles responsive (desktop/tablette/mobile).

## Gate de revue
- Tests UI contrat et régression complète, TypeScript, ESLint et build Next.js sur le même SHA.
- Vraie validation visuelle à réaliser sur 375, 768 et 1440 px, clavier, mobile, données longues et droits 403/404. Si aucun navigateur/capture authentifiée n'est disponible, ne pas la déclarer terminée.
- Recette OAuth SHA-134 indispensable avant GO : page ATLAS — TEST uniquement, seconde page non partagée, deux acteurs/workspaces, renouvellement et révocation. Aucun déploiement Vercel ni SQL lors de cette passe.
- Ce lot ne modifie ni les scopes OAuth ni le contenu Notion, ne simule pas de données et ne crée aucun worker.

Références : SHA-189 (design), SHA-182 (mission mère), SHA-134 (recette), docs/operations/notion-v2-etat-reel-et-recette-2026-10-25.md (bilan technique).
