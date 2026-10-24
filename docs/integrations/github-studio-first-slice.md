# GitHub Studio — tranche initiale (SHA-153, SHA-154)
Date : 2026-10-24. **Code en préparation, aucune création de dépôt activée.**

## Livrables
- Provider GitHub App server-only: `packages/connectors/github/src/github-studio-create.mjs`. Vérification du compte personnel, du grant `repository_creation:write`, jeton installation à permissions limitées et POST /user/repos **uniquement** après autorisation supérieure; aucune tentative réseau de production depuis Atlas.
- API `POST /api/apps/github/studio/repositories/preview` : authentification Supabase, Origin obligatoire, contrôle owner/admin du workspace, installation enregistrée et vérifiée; validation stricte du draft. Retour `canExecute: false`, aucune mutation.
- Tests unitaires mock et tests de contrat dans `tests/github-studio-*.test.mjs`.
- `GET /api/apps/github` de lecture existante n'est pas modifié.

## Conditions bloquantes avant activation
1. App owner consent à `Repository creation:write`; permissions GitHub App vérifiées et install personnelle de test approuvée.
2. Audit durable et idempotency ledger dans Supabase + gestion des succès GitHub avec réponse perdue; tests des refus cross-workspace et repos hors sélection.
3. Route d'exécution séparée et feature flag OFF par défaut, liée à une confirmation explicite; pas de proxy GitHub REST générique.
4. Réconciliation de chaque dépôt créé avec son identifiant numérique et son accès réel; la création ne confère pas silencieusement un grant workspace.
5. E2E sur dépôt personnel sandbox avec privilèges réels et nettoyage; validation d'un GO explicite avant Production.
6. Arrêter tout déploiement Vercel en cas de quota 402, sans tentatives répétées.

## Risques
Les actions POST ne sont pas rejouées automatiquement : un timeout peut survenir après création. Les réponses invalides nécessitent une réconciliation, jamais une suppression automatique. Le helper provider ne remplace pas l'authz BFF. Ne jamais transmettre le jeton, la clé PEM ou les réponses provider sensibles au navigateur/log.

## Références
- https://docs.github.com/en/rest/repos/repos#create-a-repository-for-the-authenticated-user
- https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/choosing-permissions-for-a-github-app
- https://linear.app/shadoron/issue/SHA-153
- https://linear.app/shadoron/issue/SHA-154
- https://linear.app/shadoron/issue/SHA-155
