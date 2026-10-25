> **Mise à jour post-fusion — 25 octobre 2026 :** [PR #72](https://github.com/DIALLO575/atlas-hq/pull/72) **fusionnée dans `main`** au commit [`3bec14be978a37989d2fb1e36a3018990d96b452`](https://github.com/DIALLO575/atlas-hq/commit/3bec14be978a37989d2fb1e36a3018990d96b452). **CI GitHub de PR : 5/5 jobs réussis** (run [40210335758](https://github.com/DIALLO575/atlas-hq/actions/runs/40210335758)) ; 596/596 tests applicatifs, TypeScript/lint/build et audit production à zéro vulnérabilité à la revue locale. La version est **intégrée dans `main`, mais son déploiement Vercel n'est pas confirmé** (contrôle Vercel rouge, lien de limitation de build) ; **aucun test OAuth ATLAS/Notion réel**. Pas de GO connexion ou production fournisseur. Le texte plus ancien de ce document décrivait le stade *candidat non fusionné* au début de la journée.

> **Précision 25/10/2026 :** ceci décrit la publication historique du socle Notion. Les primitives avancées de documents, médias, Markdown et vues ont ensuite été préparées **hors main**. Le [bilan d'intégration actuel](notion-v2-etat-reel-et-recette-2026-10-25.md) fait la distinction entre code testé et fonctionnalité déployée.

# ATLAS HQ Notion V2 — publication de code dans main (25 octobre 2026)

## Références et délimitation

Le dépôt GitHub `DIALLO575/atlas-hq` intègre le connecteur Notion V2 sur une base `main` qui conserve les changements GitHub Studio et Engine déjà publiés. Candidat source avant publication : `a443049f0d1306db78635df076054638c0eea380` (base source feature `6c2dd6f0fa68ec59631bf73abd702584afa3578e`). Les contenus propres à Notion ont été reportés de manière sélective, sans fusion aveugle d'une branche divergente.

Périmètre : OAuth REST code+timeout, vérification d'identité bot, recherche et blocs, vues natives/listes/aperçus en lecture seule, accès personnel/multi-tenant, refresh CAS, révocation, budgets distribués, circuit avec demi-ouverture, suivi asynchrone des **statuts GET uniquement**, TTL/retention et tests/mock. Aucun agent Notion autonome, aucune création/édition de base/page, aucun webhook/MCP, aucun scheduler activé. Le cockpit reste une interface de lecture, **pas** le moteur de composition dynamique ATLAS Live Canvas envisagé séparément.

## Versions Supabase V2 existantes

Les six migrations suivantes ont été **appliquées auparavant** au projet officiel `ovzmmsxqfifneqqgnrzd`, puis les privilèges RLS/RPC vérifiés, d'après le checkpoint SHADORON `checkpoint-e2d6fcf9d2ee2f4cd6ffecd1a5e39111e3159543d4829137baaf5e7729f0a7e8` (25 octobre 2026) :

| Fichier SQL GitHub | Version consignée côté Supabase |
| --- | --- |
| `20261024160100_atlas_notion_resource_observations.sql` | `20261025065444` |
| `20261024161500_atlas_notion_rest_distributed_gate.sql` | `20261025065445` |
| `20261024163000_atlas_notion_async_jobs.sql` | `20261025065446` |
| `20261024163500_atlas_notion_rest_circuit_breaker.sql` | `20261025065447` |
| `20261024165000_atlas_notion_async_retention.sql` | `20261025065521` |
| `20261024170500_atlas_notion_rest_half_open.sql` | `20261025065529` |

La publication du code **ne lance aucun SQL** ; ne pas rejouer les migrations sous leurs préfixes différents. Le dernier contrôle (07:10 UTC) signalait **0 connexion Notion**, **0 observation** et **0 job asynchrone** : état ponctuel, à re-vérifier avant activation.

## Vérifications, statut, GO/NO-GO

La CI historique #40139093861 était verte sur le SHA `6c2dd6f0fa68ec59631bf73abd702584afa3578e` et ne prouve pas la réussite de ce lot. Vérification locale ciblée sur le connecteur de vues natif `a443049f...` : 27/27 tests Node, plus 6/6 tests OAuth timeout sur la préparation. L'intégration dans `main` nécessite sa **propre CI**, notamment npm test, tsc, eslint, next build et PostgreSQL jetable.

Blocages avant mise en service : application Notion OAuth publique REST de test, workspace et consentement autorisés, callback HTTPS de staging, secrets configurés côté serveur, deux acteurs/workspaces et pages partagée/non partagée, tests de vues natives, refresh et révocation. Pas de preuve Notion réelle actuellement. Conserver `NOTION_OAUTH_CALLBACK_ENABLED=false` et `NOTION_ASYNC_TASK_WORKER_ENABLED=false` par défaut (et distributed budget flag OFF sauf autorisation). Le rollback de code ne révoque pas automatiquement les tokens déjà délivrés : prévoir une procédure de tombstone/revocation si nécessaire.

**Décision : publication du code possible après CI, mais intégration Notion en production = NO-GO jusqu'à recette réelle.**

Suivi : Linear SHA-134 / SHA-135 / SHA-141 ; SHADORON mission cp-c2ab69ca-208f-4fba-b8ba-b9a3da3a0c62.
