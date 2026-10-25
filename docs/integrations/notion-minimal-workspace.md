# Notion — espace de travail minimal

## Parcours

Quatre raccourcis : Projets, Réunions, Tâches, Documentation. L'utilisateur associe une vraie page/base en la sélectionnant dans la bibliothèque. Les vues restent celles du fournisseur ; le raccourci Projets ne déduit pas un statut « actif ». Il faut sélectionner sa vue Notion filtrée.

Une base reste sélectionnée pendant la découverte de ses sources et la lecture des lignes de sa première source. Plusieurs sources : sélecteur compact. Une vue remplace le tableau brut pour éviter les doublons. « Tout le contenu » revient au tableau sans filtre. Les pages des vues et les titres des lignes s'ouvrent dans le lecteur ATLAS.

Recherche par titre, pagination et limites serveur conservées. Aucun import, création de base ni mutation Notion. Les raccourcis stockent seulement les identifiants ressource/type/vue dans sessionStorage, sous une clé workspace + connexion ; pas de texte, ligne, jeton ou filtre privé. Conservation limitée à l'onglet, pas de synchronisation des préférences entre appareils. Chaque lecture revérifie les permissions côté serveur.

## Interface

Suppression du grand bandeau, des statistiques d'intégration et des descriptions répétitives. Les messages de succès sont annoncés aux lecteurs d'écran ; chargements et erreurs restent visibles. Réglages et diagnostics détaillés sont repliés. Palette blanc/noir/gris chaud, deux colonnes sur ordinateur, plein écran et navigation tactile sur mobile jusqu'à 840 px. Safe areas et comportement clavier existants conservés.

## Validation et publication

Contrôles : suite Node complète, TypeScript, ESLint ; scénario d'interaction sur les composants réels avec données de test isolées (sections, source, vue, retour de section, stockage d'identifiants). Les tests de contrat existants sont adaptés aux nouveaux libellés et au scope explicite des vues.

La recette visuelle dans un vrai navigateur et la recette fournisseur authentifiée restent nécessaires. Chromium local non disponible ; son téléchargement n'a pas abouti. Le build Next local rencontre la limitation d'environnement `uv_resident_set_memory` déjà observée.

Cette refonte dépend toujours du correctif de lecture UUID PR #88 pour la production. Elle ne prouve pas que la bibliothèque fournisseur est réparée. Quota Vercel signalé : ne pas lancer de nouveaux déploiements ni annoncer une production avant SHA/READY/alias vérifiés. Références : SHA-134 (lecture réelle), SHA-190 (interface mobile).

## Navigation mobile affinée

La barre du bas contient uniquement les quatre sections (Projets, Réunions, Tâches, Docs). La barre des sections desktop est masquée sur mobile pour éviter deux navigations identiques. Un menu « ••• » regroupe actualisation, changement de source, ouverture originale et réglages.

Dans une base, un sélecteur contextuel Contenu / Vues s'affiche. Le contenu apparaît en cartes avec titre et deux propriétés réelles au maximum ; le bouton Tableau permet de consulter toutes les colonnes chargées. Les cartes ne sont pas une reconstitution Kanban et n'appliquent aucun filtre inventé.

Ouvrir une page depuis une ligne ou une vue conserve le parent et sa source/vue. Le bouton retour restaure ce contexte. Les réglages disposent de leur propre retour au même écran sans consommer le chemin du document. Le changement de section retrouve la source et la vue choisies (identifiants seulement, dans l'onglet).

Validation supplémentaire : scénario d'interaction React réel couvrant dock à quatre sections, Liste/Tableau, ouverture d'un document, retour réglages/document/base avec sa vue, bascule Contenu sans écran vide, restauration par section. Suite complète : 756/756. TypeScript et ESLint validés. Recette visuelle sur appareil et publication restent distinctes.
