# Atlas GitHub — troisième pilier : Actions Control Center

Date : 2026-10-25. **Tranche d'intégration en PR draft, pas sur main ni en Production.**

## Positionnement

1. GitHub Pull Requests : lecture du code et des diffs.
2. GitHub Repository Studio : préparation, approbation et création sécurisée de dépôts (écriture Production toujours désactivée).
3. **GitHub Actions** : comprendre pourquoi les builds passent ou échouent, diagnostiquer les jobs et préparer des relances supervisées.

## V1 — diagnostics CI réels, lecture seule

- Nouveau panneau dans GitHub Control Center : choisir une installation/repository Atlas déjà autorisé, afficher 20 runs, filtrer succès/échecs, inspecter 100 jobs et leurs étapes échouées. Liens profonds vers les logs GitHub.
- Nouveau GET `/api/apps/github/actions` modes `runs` et `jobs`. Vérifie `auth.getUser`, rôle `owner/admin/member`, appartenance workspace, statut et vérification de l'installation, et pour `selected`, le grant exact du repository en Supabase. Pour `all`, l'App GitHub valide live le repository ID.
- Token d'installation **à usage lecture Actions**, restreint à `repository_ids: [repositoryId]` et `permissions: {actions:"read"}` ; GitHub doit confirmer que le dépôt est accessible. Vérification par `GET /installation/repositories` avec le jeton restreint pour confirmer ID, propriétaire et nom exact.
- Aucun jeton, contenu brut des logs, secret ou corps d'erreur externe renvoyé à la page. Pas de fallback public, pas de mutation GitHub Actions. L'API PR d'origine ne change pas.
- Si `Actions: Read` n'a pas été approuvé côté installation, afficher une erreur claire sans supposer la permission.

## V2 — diagnostic assisté et relance contrôlée (NON implémenté)

- Créer un modèle d'échec regroupant les étapes, chemins et catégories (sans téléverser les logs privés ni transformer des logs en instructions).
- Autorisation séparée `Actions: Write` avec réapprobation de l'installation et un rôle owner/admin Atlas.
- Prévisualiser run ID, commit SHA, branche, tentative, job échoué, puis confirmation manuelle avant **relance ciblée des jobs échoués** ; écriture auditée, idempotente, anti-double clic, validation nouvelle de l'installation et du grant live. Sandbox E2E d'abord.
- Important GitHub : un re-run utilise les privilèges de l'acteur initial, pas ceux de l'initiateur. Pas de relance silencieuse ni de flux CI répété automatiquement.

## Vérifications

Tests node mock : token scoped, 403 sur repo non autorisé, action:read manquante, détails jobs/failedSteps, route read-only et UI responsive. CI standard du projet (test, typecheck, lint, build, tests PostgreSQL, scanners).

GitHub Docs :
https://docs.github.com/en/rest/actions/workflow-runs
https://docs.github.com/en/actions/how-tos/manage-workflow-runs/re-run-workflows-and-jobs
Linear : SHA-166 (enfant de SHA-164).

## Correction du message trompeur « Actions: Read » — 2026-10-25

L'ancien message prescrivait une réapprobation de l'App pour tout refus `PERMISSION_DENIED`, y compris un 403/422 sans diagnostic de la cause. Il ne prouvait pas la permission manquante. Le nouveau code distingue :
- `INSTALLATION_SCOPE_REJECTED` : rejet 403/422 du jeton limité à l'installation et au dépôt. Vérifier leurs identifiants, la sélection de dépôts, les éventuelles demandes GitHub en attente.
- `ACTIONS_TOKEN_SCOPE_UNVERIFIED` : scope `actions:read` non confirmé dans le jeton restreint; pas de conclusion sur les droits déclarés de l'App.
- `ACTIONS_API_FORBIDDEN` : appel de consultation des runs/jobs Actions refusé (403/422), alors que le jeton avait été émis.
- `PERMISSION_DENIED` : refus générique pour une autre étape, notamment la vérification des dépôts accessibles.

Ne réapprouver l'App **que si GitHub présente effectivement une demande en attente**. Vérifier que l'ID d'installation et le dépôt autorisé dans Atlas correspondent à l'installation GitHub réellement active. La correction conserve les contrôles stricts, le jeton scindé `repository_ids:[repositoryId]` et `permissions:{actions:"read"}`, et aucun fallback public. Les messages de GitHub, secrets et jetons ne sont jamais exposés au client. Ce correctif diagnostique ne prouve pas que la connexion du propriétaire est valide en live.

Référence officielle : https://docs.github.com/en/rest/apps/installations?apiVersion=2026-03-10
