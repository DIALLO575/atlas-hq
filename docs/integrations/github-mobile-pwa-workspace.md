# ATLAS GitHub — PWA mobile de pilotage

**Date : 25 octobre 2026.** Dernière étape visuelle de la PR #48. Version de développement seulement : pas de fusion dans main ni de déploiement Production.

## Objectif
La PWA GitHub n'est **pas** une colonne desktop comprimée. Sur téléphone (largeur ≤760px), `/apps/github` devient un espace autonome couvrant le viewport du smartphone, avec des actions à portée du pouce. La navigation Atlas reste accessible via la flèche **Retour à Atlas**.

## Fonctionnement mobile

- **En-tête natif compact** : retour Atlas, identité GitHub et sélecteur de workspace, suivi d'une ligne de statut et synchronisation (bouton icône).
- **Navigation basse persistante** : Accueil, Dépôts, PR, Créer, Actions, Plus (Connexions) ; onglet actif visible, icônes SVG, zones tactiles ≥49px et `aria-current`. Les six destinations fonctionnent sans menus cachés.
- **Dashboard** : accueil mobile compact, trois indicateurs utiles, quatre raccourcis, PR récentes. Les données viennent des mêmes APIs authentifiées et restent sujettes aux limitations de lecture.
- **Dépôts** : cartes/liste tactile avec recherche et filtres visibles, tap sur un dépôt pour ses PR.
- **Pull Requests** : **drill-down** sur téléphone, liste et inspecteur jamais affichés côte à côte. Tap sur PR → écran détail avec « Retour aux Pull Requests ». Fichiers modifiés en carrousel horizontal tactile et diff à défilement horizontal sécurisé ; lecture seule.
- **Actions / CI** : liste des runs ou inspecteur d'un run, jamais deux colonnes rétrécies. Bouton « Retour aux workflows », jobs et erreurs lisibles, liens GitHub vers logs privés. Toujours `Actions:Read` uniquement.
- **Studio création** : formulaire mobile d'abord, étapes 1/2/3 condensées, visibilité privée/publique, champs ≥16px pour éviter le zoom iOS, aperçu ensuite ; confirmation explicite existante conservée et aucune création Production activée.
- **Connexions** : accessible via « Plus ». Autorisations serveur inchangées.

## PWA et compatibilité

- `public/manifest.webmanifest` reçoit un **raccourci GitHub** direct vers `/apps/github` ; la PWA Atlas est déjà `display:standalone`.
- Mise en page `100dvh`, `position:fixed` côté smartphone uniquement, surface au-dessus du dock Atlas, safe areas iOS/Android (top, bottom, left, right), marges pour gestes système, scroll contenu.
- Barre basse masquée pendant la saisie si le navigateur supporte `:has(input:focus)` ; touch targets 44–49px ; `prefers-reduced-motion`.
- Pas d'API Fullscreen navigateur requise sur téléphone. Sur desktop, le bouton Focus GitHub existant reste inchangé.
- **Connexion réseau obligatoire** pour GitHub ; aucun cache offline de repositories/PR privés n'a été ajouté.

## Critères QA avant release

1. iPhone SE 320/375px, Pixel 390/412px, paysage téléphone et tablette ≤760px : zéro débordement global, dock toujours accessible avec safe area.
2. Ouvrir GitHub depuis le raccourci PWA, changer workspace et installation, revenir à Atlas.
3. Navigation PWA → Dépôts → PR → inspecteur fichier → retour PR ; retenter un autre dépôt ; pas de diff stale.
4. Navigation Actions → choisir repo → run → jobs → retour workflows ; nouveaux repos sans anciens jobs.
5. Studio : saisie des formulaires avec clavier virtuel, radio privé/public, preview et approbation ; sortie sans création live.
6. Screen reader/focus, mode contraste sombre/clair, redimensionnement, scroll horizontal des diffs.
7. Tester avec une session GitHub App réellement autorisée en Preview avant fusion. Une CI verte ne remplace pas une revue visuelle en émulation + appareil réel.

Fichiers : `src/app/github-mobile-workspace.css`, `src/components/github-control-center.tsx`, `src/components/github-actions-control-center.tsx`, `src/app/layout.tsx`, `public/manifest.webmanifest`.

PR : https://github.com/DIALLO575/atlas-hq/pull/48
