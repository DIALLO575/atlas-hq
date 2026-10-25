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
