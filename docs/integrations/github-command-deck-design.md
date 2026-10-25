# GitHub Command Deck — navigation dédiée et mode plein écran

Date : 25 octobre 2026. **Travail en PR draft #48, non déployé sur Production**.

## Demande et choix de design

Le Control Center GitHub auparavant présenté comme un écran de navigation à onglets horizontaux utilisait une grande zone titre, un arrière-plan Atlas violet et regroupait la liste des dépôts et l'inspecteur des Pull Requests au même endroit. Il était peu adapté aux workflows de pilotage GitHub.

Ce correctif introduit six **espaces distincts** dans une navigation latérale reprenant les repères visuels de GitHub :
1. **Tableau de bord** — accueil autonome, métriques issues des appels GitHub existants, 4 raccourcis fonctionnels et 4 PR ouvertes récentes du dépôt sélectionné ;
2. **Mes dépôts** — liste et filtres, sans inspecteur de PR ;
3. **Pull Requests** — liste et inspecteur de diffs côte à côte ;
4. **Création de dépôt** — Repository Studio indépendant, préparation et approbation explicite sans création réelle ;
5. **CI / Actions** — exécutions, jobs et étapes en échec, jeton Actions:Read limité au dépôt ;
6. **Connexions** — vérification des installations GitHub et des accès.

L'en-tête devient une barre compacte GitHub Workspace (titre ~19 px), avec badge GitHub, changement de workspace et commande **Plein écran**. Le mode plein écran met le module au premier plan en couvrant la navigation Atlas via une surface positionnée en viewport, bloque temporairement le scroll du document et restaure celui-ci après fermeture. Le bouton et la touche **Escape** ferment le mode. Aucune permission navigateur ni API Fullscreen n'est nécessaire.

## Identité visuelle

- Palette : GitHub charcoal `#0d1117`, texte `#1f2328`, surfaces `#f6f8fa` ; vert GitHub `#238636` pour les actions, bleu `#0969da` pour la navigation, accents du studio et de la CI distincts.
- Rail latéral sombre sur ordinateur ; navigation horizontale avec scroll sur tablette et mobile.
- Tableaux de bord structurés avec chiffres réels ou `—` si les données ne sont pas chargées, sans inventer de métriques CI.
- Grilles fluides, focus visible et gestion de reduced-motion.
- Feuille CSS **scopée** `github-command-deck.css` chargée après `github-control-center.css` : n'affecte pas Linear, Notion ni les autres interfaces Atlas.

## Sécurité et limites

Aucun changement d'API de mutation ou de permission GitHub. Le mode Plein écran est **un mode d'affichage**, pas un élargissement des droits. La création de dépôts et les relances GitHub Actions restent OFF en Production et les accords sandbox doivent toujours être explicitement autorisés. L'accueil affiche uniquement des données déjà obtenues et autorisées sur le serveur, sans nouvel accès sensible.

## Vérifications

Tests de navigation entre sections, rendu conditionnel distinct des PR, mode focus (Escape, scroll restore), imports CSS et séparation des capacités. À compléter par revue visuelle authentifiée dans une Preview Vercel/Netlify avant la fusion.
