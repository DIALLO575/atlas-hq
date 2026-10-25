# ATLAS HQ — Intégration n8n sur main, code & documentation (2026-10-25)

## Inclus et état réel

Ce lot consolide les PR **#57, #58, #59, #61, #63, #65, #66, #67, #69**, la certification **NO-GO #70** et le design n8n **#75** sur le main courant, plutôt que fusionner brutalement les anciennes branches devenues divergentes.

Le code contient les contrats REST/MCP/webhooks n8n **offline**, le registre SQL déjà appliqué en production (migrations `20261025114449`, `20261025120150`, `20261025133921`), les projections Chief/Agents/Missions, le catalogue Action Gateway REST/MCP non appelable, les tests de sécurité et l'Operations Studio corail/rose dans **Mes Apps**. Réellement utilisables : la navigation et consultation autorisées du registre Atlas, la recherche et les filtres, et l'enregistrement d'une fiche d'instance **hors ligne** par propriétaire/admin.

**NON LIVRÉ :** connexion à un vrai n8n, client MCP live, exécution ou publication de workflows, webhook live, déverrouillage SQL, principal machine ou licence commerciale d'éditeur externe. Le verrou `atlas_n8n_runtime_offline_only` et HTTP 423 restent actifs. La matrice de compatibilité MCP PR07 devra encore être réconciliée sur une instance pinée. Certification PR10 **NO-GO** pour sandbox live, SaaS builder et production n8n.

## Réconciliation du main avancé

Base : `c8b383f7a8e7f2a6925a7e08ffe9d8d9a9292805`. Les évolutions antérieures MAUSBOT, Notion, Github Studio et Engine Hub sont préservées :
- `src/app/agents/page.tsx` garde le formulaire MAUSBOT **AgentRequestForm** et ajoute le panneau d'automatisations n8n en complément;
- `tests/cockpit-contract.test.mjs` protège à la fois l'inventaire de demandes Agent et le panneau n8n;
- `.github/workflows/ci.yml` conserve tous les jobs PostgreSQL/worker/main actuels et ajoute la vérification PostgreSQL n8n.

La fusion des branches historiques dépendantes est représentée dans une **PR consolidée** depuis le main actuel. Les anciennes PR doivent être clôturées comme **intégrées par consolidation**, jamais déclarées individuellement merged si elles ne l'ont pas été.

## Incident GitHub Actions : réapprobation prétendue nécessaire

L'ancien `PERMISSION_DENIED` affichait systématiquement la recommandation de réapprouver « Actions: Read ». Le nouveau diagnostic distingue échec d'émission de jeton limité, scope du jeton non confirmé, rejet de l'API Actions et problème d'autorisation du dépôt, sans lever les permissions ni révéler de secrets. Si l'utilisateur voit un refus, comparer l'installation/dépôt réellement actifs et ne demander une réapprobation que si GitHub indique une approbation en attente.

## Revue, release et suite

**Avant merge :** tests Node, TypeScript, ESLint, build Next.js, PostgreSQL (Engine et n8n, autres connecteurs), scan de secrets, audit, comparaison au main actuel, revue de diff. **Après merge :** contrôler SHA de main et éventuellement le déploiement Vercel `READY` ciblant son domaine, sans confondre une fusion de code avec un fonctionnement n8n.

**Aucune nouvelle migration Supabase dans cette intégration** : les trois migrations présentes dans l'historique officiel ne doivent pas être rejouées ni leurs CHECK supprimées. Le test navigateur authentifié deux workspaces, la sandbox n8n, les permissions, la licence, la gestion des secrets et les tests de panne restent à réaliser avant toute mise en service.
