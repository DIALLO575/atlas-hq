# GitHub Studio — Finalisation atomique d'un dépôt (SHA-154 / SHA-155)

**24 octobre 2026 — code de branche PR #43 uniquement. Aucun déploiement ni migration Supabase Production.**

## Pourquoi ce changement

Avant ce patch, l'appel SQL générique `atlas_gh_studio_advance` pouvait mener directement à `succeeded`, sans écrire lui-même la liaison du dépôt au workspace. Ce chemin est désormais refusé.

La fonction `atlas_gh_studio_finalize_repository(operation_id, repository_id)`, accessible au seul rôle `service_role`, est le chemin serveur normal de finalisation. Elle :
1. verrouille l'opération et vérifie les états `provider_confirmed` ou `reconciliation_required`, l'identifiant GitHub numérique exact, l'appartenance admin actuelle et l'installation vérifiée et active ;
2. en mode `selected`, écrit l'accès `atlas_github_authorized_repositories` pour le dépôt déjà vérifié par le serveur ; en mode `all`, s'appuie sur l'installation all-repositories validée sans introduire de ligne sélection artificielle ;
3. bascule l'opération en `succeeded` puis ajoute l'événement d'audit ;
4. exécute les trois opérations dans **une transaction PostgreSQL unique** : si l'audit échoue, l'autorisation et le succès sont annulés également.

L'appel générique `atlas_gh_studio_advance` **ne peut plus** émettre `succeeded`. Les retries concurrents et les identifiants erronés sont rejetés.

## Frontière de confiance et limites

La base PostgreSQL **ne peut pas confirmer un grant GitHub à elle seule**. Avant d'appeler le finaliseur, la future API serveur doit vérifier auprès de GitHub (jeton d'installation courant) :
- l'installation, son état non suspendu, le compte propriétaire et l'ID du dépôt réellement créé ;
- l'accès effectif du dépôt à cette installation et la correspondance avec le workspace, sans accepter les identifiants d'un navigateur comme preuve ;
- le maintien du consentement GitHub App `Repository creation: write` et de l'autorisation de l'acteur Atlas.

Le SQL fait confiance uniquement au **serveur privilégié** détenteur du rôle service. Aucune route d'exécution n'est exposée et **aucun appel GitHub réel n'est lancé par cette migration**. Une future API devra relire et confirmer les grants live juste avant d'appeler la fonction.

## Validation automatisée

- Les tests SQL utilisent la migration réelle sur PostgreSQL 17 jetable et vérifient le refus d'une finalisation générique, les IDs incompatibles, la protection contre les replays, la révocation et le mode all.
- Un trigger de test rejette volontairement l'écriture d'audit ; le test prouve alors que **ni la liaison du dépôt ni le statut succès ne persistent**.
- Le test CAS concurrent reste activé.
- La CI GitHub Actions exécute cette suite, en plus de npm test, typecheck, lint, build et Gitleaks.

## Étapes restantes avant GO

Créer l'adaptateur serveur de vérification réelle des grants, relier `finishWithAccess` de l'orchestrateur au RPC service-role, finaliser la route `execute` avec approbation explicite, appliquer la migration après revue dans l'environnement visé, puis réaliser un E2E de création sur un dépôt sandbox personnel.
