# Notion dans ATLAS — bilan consolidé du 25 octobre 2026

Cette note rassemble le socle Notion V2, sa mise en service partielle, le correctif de lecture et l'interface minimaliste. Elle remplace, pour l'état courant, les anciens bilans de la journée ; ceux-ci restent des historiques datés.

## Livraison du lot de consolidation

Le Founder a explicitement demandé de documenter et fusionner l'ensemble du travail Notion dans `main`. Ce lot regroupe le correctif de la PR [#88](https://github.com/DIALLO575/atlas-hq/pull/88) et les candidats d'interface [510c2acd](https://github.com/DIALLO575/atlas-hq/commit/510c2acdfca5fff16d4f31a37a0df31036f3354e), puis [12f814b8](https://github.com/DIALLO575/atlas-hq/commit/12f814b828e3ca4ec8ab10cac05dc237fcc83e3e), sur le `main` observé `e4d0dd1aed3aca7004de4d4025244d24a8f1092a`. Les autres chantiers ATLAS présents sur main sont préservés.

La PR de consolidation, son SHA de fusion et la CI exacte sont consignés dans [SHA-182](https://linear.app/shadoron/issue/SHA-182). La fusion du code, le déploiement Vercel et la recette fournisseur sont trois états distincts. Une autorisation de fusion n'autorise aucun changement de facturation, de secret, de migration, de permission ou de contenu Notion.

## Ce qui a été développé

| Domaine | Fonctionnement disponible dans le code | Limites / recette restante |
| --- | --- | --- |
| Connexion personnelle REST | OAuth, état CSRF, jetons chiffrés serveur, refresh CAS, déconnexion/révocation, contrôle acteur/workspace/connexion | Consentement réel et enregistrement déjà constatés ; lecture et tests W1/W2 à confirmer |
| Bibliothèque | Recherche par titre, pages/bases/sources autorisées, pagination manuelle | Pas de recherche plein texte ni accès implicite à toutes les pages |
| Pages et blocs | Sous-blocs bornés, pagination, texte enrichi, mentions, tableaux, pièces jointes | Complétude des blocs complexes et comparaison fournisseur à vérifier |
| Markdown | Lecture officielle v1 et aperçu texte filtré | Conversion avec perte ; liens signés retirés ; pas d'export intégral fidèle |
| Médias | Images, PDF, audio, vidéo et fichiers via proxy personnel | Taille/temps/MIME bornés ; gros fichiers, Range et Office incomplets |
| Bases et sources | Colonnes, statuts, sélections, résultats de formules, relations projetées, lignes paginées | Données projetées et bornées ; lecture réelle à recetter |
| Vues | Découverte, contrôle base/source, filtres/tris appliqués chez Notion, aperçu et nettoyage du cache temporaire | Pas de clone Kanban/calendrier/galerie entièrement interactif |
| Sécurité | Permissions personnelles, origine fixe, validation UUID/cursors, réponses projetées, pas de token ni URL média signée au navigateur | Tests unitaires/SQL/CI ne remplacent pas les refus réels et la révocation |

Historique des lots intégrés avant cette consolidation : PR #32/#36 (socle), #72/#73 (lecture riche et cockpit), #80/#82 (mobile), #83 (bilan), #84 (diagnostics de lecture), #87 (classification sûre des erreurs fournisseur). Les PR #34/#35 ont été regroupées dans #36 ; il ne faut pas les réintégrer séparément.

## Correctif de lecture réelle — SHA-134

Après le consentement utilisateur, ATLAS affichait la connexion enregistrée mais aucune page, avec `notion-invalid-request`. Le lecteur personnel attendait par erreur un UUID `8-4-4-4-4-12`, au lieu du standard `8-4-4-4-12`. Les identifiants valides étaient rejetés **avant** les contrôles de membership et l'appel Notion.

La PR #88 corrige cette validation. Le test exécute le véritable lecteur TypeScript : un identifiant normal atteint désormais le contrôle des droits ; les identifiants mal formés sont toujours refusés avant accès aux credentials. Le défaut est reproduit sur l'ancien code. Le diagnostic fournisseur de #87 reste utile, mais ne réparait pas ce rejet local.

Ce correctif ne prouve pas, à lui seul, que Notion autorise une page : après déploiement, conserver la connexion existante, actualiser les ressources et vérifier une page réellement partagée. Ne pas demander une reconnexion ou un partage massif pour masquer ce défaut local.

## Interface minimaliste et navigation mobile — SHA-189 / SHA-190

- Quatre espaces : **Projets, Réunions, Tâches, Documentation**. L'utilisateur leur associe une vraie page/base et sa vue. Les projets actifs utilisent la vue filtrée de Notion ; ATLAS n'invente aucun statut actif.
- Grand bandeau, statistiques d'intégration et paragraphes répétitifs supprimés. Recherche compacte, bibliothèque et lecteur en deux colonnes sur ordinateur ; réglages et diagnostics détaillés repliés.
- Une base reste sélectionnée pendant la lecture de ses sources et lignes. Plusieurs sources : sélecteur. Une vue sélectionnée remplace le tableau brut, sans doublon.
- Sur mobile : une seule barre principale en bas (Projets/Réunions/Tâches/Docs), commandes Contenu/Vues uniquement dans une base, menu secondaire pour actualiser/changer de source/ouvrir l'original/réglages.
- Lignes présentées en cartes avec titre et deux propriétés réelles au maximum ; bascule Tableau pour toutes les colonnes chargées. Les pages des vues et les lignes s'ouvrent dans le lecteur ATLAS.
- Retour document vers la base/source/vue d'origine ; retour des réglages au même document. Source/vue retrouvées au changement de section.
- Palette Notion blanc/noir/gris chaud, zones tactiles espacées, focus visible, plein écran jusqu'à 840 px, safe areas et gestion clavier. Manifeste, service worker et PWA générale ATLAS inchangés.
- Raccourcis conservés dans **l'onglet courant uniquement** : identifiants ressource/source/vue et type, sous une clé workspace+connexion. Aucun contenu ni token stocké ; pas de synchronisation des préférences entre appareils. Les droits restent revérifiés au serveur.

Détail : [espace minimaliste](../integrations/notion-minimal-workspace.md).

## Validation et limites de preuve

La dernière passe d'interface a réussi 756 tests, TypeScript et ESLint. Le scénario d'interaction sur les composants React réels couvre les quatre sections, source/lignes, vues filtrées, Liste/Tableau, retour document/réglages/base/vue, absence de tableau dupliqué et stockage limité aux identifiants. Le lot consolidé ajoute les deux tests UUID ; son résultat et la CI de publication sont consignés dans SHA-182/SHA-134.

Le build Next local est bloqué dans cet environnement par `ENOENT uv_resident_set_memory`, donc la compilation de publication doit être confirmée par GitHub CI. Chromium local n'a pas pu être installé ; aucune capture navigateur ni recette visuelle réelle sur téléphone n'est affirmée. Aucune nouvelle migration, variable OAuth, permission ou donnée Notion n'est modifiée par ce lot.

## Ce qui reste

1. **Publication Vercel** : vérifier le SHA exact, `READY`, l'alias `atlas-hq-preview.vercel.app` et la route `/apps/notion`. Une CI verte ou une preview Netlify ne prouve pas ce déploiement. Quota Vercel rencontré ; ne pas multiplier les tentatives ni modifier le plan.
2. **SHA-134 — recette réelle** : rafraîchir avec la connexion existante ; lire une page/base/vue autorisée ; vérifier page non partagée, acteur/workspace interdit, refresh/révocation et absence de fuite de secrets. OAuth enregistré ≠ fournisseur pleinement validé.
3. **Recette mobile** : téléphone/tablette, clavier, safe areas, documents longs, média réel, scroll des colonnes, navigation et retours, erreurs/états vides, lecteur d'écran.
4. **Fonctions futures** : gros médias/streaming/Office, fidélité avancée des blocs/vues et objets complémentaires (SHA-137/139/140).
5. **Écritures et agents** : création/modification/déplacement/corbeille, webhooks/MCP/agents/automatisations restent des lots distincts. Aucune activation implicite ; écritures selon approbation humaine et contrôles serveur (SHA-138).

## Suivi

- [SHA-182 — mission Notion](https://linear.app/shadoron/issue/SHA-182)
- [SHA-190 — design et navigation mobile](https://linear.app/shadoron/issue/SHA-190)
- [SHA-134 — recette réelle](https://linear.app/shadoron/issue/SHA-134)
- Lots de lecture : SHA-183/184/186/187/188/189 ; conserver la recette distincte du code fusionné.
- SHADORON : mission `cp-c2ab69ca-208f-4fba-b8ba-b9a3da3a0c62`, checkpoint après fusion avec SHA/CI/déploiement observés et blocages restants. Pas de modification de l'état canonique.
