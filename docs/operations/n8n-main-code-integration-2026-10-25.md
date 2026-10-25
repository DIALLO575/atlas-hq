# Atlas HQ × n8n — Code consolidé, sécurité préservée

Date d'intégration : 25 octobre 2026. Base du nouveau lot : `main` au commit `2114308e9da9ca311d35d86d2b2f251829836aee`.

## Portée réellement livrée

Ce lot fusionne fonctionnellement les développements précédemment empilés dans les PR #57, #58, #59, #61, #63, #65, #66, #67 et #69, le dossier de certification **NO-GO** de #70 et la console n8n Operations Studio de #75. Le lot ne reprend **pas** les corrections non liées du connecteur GitHub Actions et préserve la mise à jour Notion mobile (#80) déjà fusionnée sur main.

- **Mes Apps > n8n** : Operations Studio au thème Atlas et couleurs corail/rose, navigation « Vue d’ensemble / Workflows / Exécutions / Connexion & sécurité ». Recherches et filtres réels sur le registre Atlas, enregistrement d’instance **hors ligne** pour owner/admin, historique et diagnostics sans faux signal « connecté ».
- **Chief / Agents / Missions** : panneaux n8n authentifiés et limités au workspace. **Agents conserve le véritable formulaire MAUSBOT** déjà intégré à main. Chief garde le mode guidé non agentique.
- **Backend** : contrats REST/MCP, API REST read-only sécurisée à transport bloqué, états préconnexion, système de callbacks HMAC/nonce et réconciliation simulée, action gateway REST/MCP non appelable, projections de workflows/exécutions Supabase RLS.
- **SQL** : ajout au dépôt de trois migrations d’automatisation n8n déjà enregistrées dans l’historique Supabase de production (`20261025114449`, `20261025120150`, `20261025133921`). **Elles ne doivent pas être réappliquées**. La contrainte `atlas_n8n_runtime_offline_only` reste en place, ainsi que les refus HTTP 423.
- **Vérifications** : tests Node, typecheck, lint, build Next.js, scanner de secrets, audit, jobs PG17 n8n et connecteurs existants. Le CI n8n est ajouté en conservant les jobs déjà présents sur main.

## Séparation code / mise en service

Ce code ne connecte aucune instance n8n réelle : 0 attestations REST/MCP/webhook live, pas d'identité machine, de secrets partagés, d'appel de workflow distant, d’exécution ou de publication. Le fournisseur n8n reste **hors ligne**, même après merge sur main ou build Vercel READY. Les écrans affichent seulement des données réelles stockées dans le registre Atlas et ne fabriquent pas d'exemples d'activité.

Le dossier SHA-181 maintient **NO-GO** pour sandbox live, éditeur SaaS client et production automatisée. Corriger la matrice de versions MCP sur une véritable instance, faire une campagne E2E authentifiée à deux workspaces, vérifier approbations/worker/replay/retour arrière, puis obtenir une réponse écrite sur les modalités de licence n8n pour l'édition externe par UI ou IA. Une migration future distincte et revue devra lever le verrou SQL, jamais cette intégration.

## Ordre des archives GitHub et Linear

Une fois cette PR consolidée fusionnée sur main, les anciennes PR empilées peuvent être clôturées comme « incluses par consolidation », **sans prétendre qu'elles ont été fusionnées individuellement**. SHA-172 à SHA-180 peuvent indiquer « code intégré / exécution réelle non livrée ». SHA-181 reste **In Progress / NO-GO** tant qu'une certification E2E indépendante n'est pas apportée.

## Désaccord de version MCP identifié

Les planchers d'outils définis dans `packages/engines/n8n/src/mcp-client.mjs` ne valent **pas** validation du support réellement disponible. Le plancher historique `2.12.0` pour des outils constructeur doit être rapproché de la documentation n8n concernant `2.13.0` et `2.18.3` sur une instance de test épinglée. Ne jamais activer MCP builder sur la simple foi du catalogue offline.

## Déploiement

Le merge peut déclencher Vercel automatiquement selon la configuration du projet. Vérifier séparément le SHA build READY, les pages du domaine approprié, les permissions RLS et la présence persistante du verrou SQL. Aucun GO ni activation automatique n’est produit par cette PR. Aucune migration SQL nouvelle exécutée et aucun secret n’est ajouté au dépôt.

Lien de certification : `docs/integrations/n8n-pr10-certification.md`. Runbook de rollback : `docs/runbooks/n8n-pr10-rollout-rollback.md`.

### Réconciliation postérieure : nouvelle expérience Agents / Engine Hub (#78)

`main` a avancé après la première CI, avec un nouvel `AgentsWorkspace` à sélection de workspace côté client et un Engine Hub visuel modernisé. La consolidation préserve **intégralement** le nouveau `src/app/agents/page.tsx`, sa navigation et ses contrats, et place le panneau n8n **dans le même `AgentsWorkspace` sous le workspace effectivement sélectionné**. Le contrôle de changement de tenant reste dans le composant n8n (annulation des requêtes précédentes). Le Hub conserve ses logos MAUSBOT/Hermes et ajoute une tuile n8n plus un lien vers Mes Apps, sans le rendre disponible à l'exécution. Les tests de coordination n8n ciblent désormais ce composant partagé, et les tests existants MAUSBOT doivent rester verts.
