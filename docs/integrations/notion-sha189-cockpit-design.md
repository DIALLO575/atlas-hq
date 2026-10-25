> **Mise à jour post-fusion — 25 octobre 2026 :** [PR #72](https://github.com/DIALLO575/atlas-hq/pull/72) **fusionnée dans `main`** au commit [`3bec14be978a37989d2fb1e36a3018990d96b452`](https://github.com/DIALLO575/atlas-hq/commit/3bec14be978a37989d2fb1e36a3018990d96b452). **CI GitHub de PR : 5/5 jobs réussis** (run [40210335758](https://github.com/DIALLO575/atlas-hq/actions/runs/40210335758)) ; 596/596 tests applicatifs, TypeScript/lint/build et audit production à zéro vulnérabilité à la revue locale. La version est **intégrée dans `main`, mais son déploiement Vercel n'est pas confirmé** (contrôle Vercel rouge, lien de limitation de build) ; **aucun test OAuth ATLAS/Notion réel**. Pas de GO connexion ou production fournisseur. Le texte plus ancien de ce document décrivait le stade *candidat non fusionné* au début de la journée.

# SHA-189 — ATLAS HQ Notion V2 : design avant déploiement

**Code fusionné dans `main` mais non vérifié en production.** Le cockpit présente les primitives SHA-183/184/186/187/188 dans une interface responsive, sans données fictives. Aucun OAuth Notion via ATLAS, aucune mise en production.

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
