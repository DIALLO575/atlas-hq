# SHA-155 — Vérification live du grant GitHub + adaptation Supabase

Date : 24 octobre 2026. PR #43, branche de développement uniquement ; **aucun dépôt réel créé et aucune API d'exécution activée**.

## Preuve de grant fournisseur

Le module `github-studio-grant-verifier.mjs` :
1. valide l'appartenance workspace/installation déjà vérifiée côté Atlas ;
2. émet un JWT App serveur et lit l'installation **live** via `GET /app/installations/{id}`, vérifie son statut, le compte User propriétaire, `repository_selection` et la permission `repository_creation:write` ;
3. demande un jeton d'installation **limité à l'identifiant numérique exact** avec `repository_ids: [id], permissions: {}` ; GitHub refuse si le dépôt ne fait pas partie des accès de l'installation ;
4. interroge `GET /installation/repositories` avec ce jeton restreint, confirme ID, nom complet, propriétaire, URL et présence unique. Un décalage ou 401/403/422 conduit à un refus ou une réconciliation, jamais à un succès.

Référence officielle : https://docs.github.com/en/rest/apps/installations#list-repositories-accessible-to-the-app-installation et https://docs.github.com/en/rest/apps/apps#create-an-installation-access-token-for-an-app

## Adaptateur de persistance Supabase

Le module `github-studio-store.mjs` traduit les RPC `atlas_gh_studio_reserve`, `atlas_gh_studio_advance`, `atlas_gh_studio_finalize_repository` en opérations vérifiées à schéma fixe. Les erreurs SQL internes sont ramenées à un code non sensible. `src/lib/github/studio-server.ts` compose provider, audit/RPC et vérificateur dans un module `server-only`. Ce dernier **n'est appelé par aucune API actuelle**.

## Étapes bloquantes

- Le propriétaire doit approuver les nouvelles permissions GitHub App et l'installation personnelle de test.
- Raccorder une route `execute` uniquement après confirmation humaine, flag OFF par défaut, session Supabase fraîche et contrôle CSRF.
- Appliquer la migration PostgreSQL dans l'environnement voulu après revue (non appliquée à Supabase Production).
- Exécuter E2E de création *sandbox* et vérifier la nouvelle permission sur le jeton réel avant une première création.
- Améliorer la reprise encadrée des opérations incertaines et les refus de changements de droits mid-flight.

La preuve live est un contrôle nécessaire mais n'est pas une garantie durable contre une révocation future ; le contrôle d'accès doit être refait pour chaque opération ultérieure. Aucun jeton GitHub n'est exposé au navigateur ou persisté dans une mission.
