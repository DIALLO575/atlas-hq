# GitHub Actions — relance ciblée sous confirmation

Cette tranche ajoute **Relancer ce job** dans le panneau Actions d'Atlas, sans élargir le jeton de lecture déjà existant.

## Sécurité et périmètre
- Serveur POST dédié : session Supabase valide, membre owner/admin, installation du même workspace, dépôt explicitement autorisé (ou mode all revérifié chez GitHub), Origin HTTPS exact, confirmation manuelle et nom complet du job ressaisi.
- GitHub App : un **nouveau jeton Actions:write limité à un seul repository ID**. La réponse GitHub doit valider ce périmètre et son accès effectif.
- Le serveur relit le run (repo ID, SHA, attempt, état completed/failure, dépôt source non fork, date 30 jours) et le job (ID, run ID, attempt, état failure/timed_out).
- PostgreSQL : une opération par `installation + repository + job_id + run_attempt`, idempotence, réservation et transition CAS avant le POST, audit append-only, service role uniquement. Aucune fuite de jeton ni de logs dans le navigateur.
- **Un seul POST** de relance ciblée par opération. Une réponse incertaine reste en `reconciliation_required`, sans retry automatique.
- GitHub rerun réutilise les privilèges de l'acteur qui a déclenché la CI. Les forks / repos sources différents sont rejetés dans cette V1.

## Déploiement
- Migration alignée sur la version enregistrée en production : `supabase/migrations/20261025085932_github_actions_rerun_ledger.sql`. Ne pas la réappliquer : le projet Supabase ATLAS enregistre déjà cette version.
- Variable serveur `ATLAS_GITHUB_ACTIONS_RERUN_ENABLED=production` sur la cible Production ; `sandbox` seulement sur Preview. Par défaut, route désactivée.
- La permission GitHub App Actions: Read and write doit être **approuvée par chaque installation**. L'utilisateur a annoncé l'avoir activée dans les paramètres de l'App ; la création du jeton vérifiera réellement l'accord de l'installation.
- Tester la relance sur un job en échec de dépôt de test avec session owner/admin avant un déploiement public.
- La présence du bouton ne signifie pas que l'utilisateur a perdu le contrôle : il doit confirmer explicitement, jamais automatiquement.

GitHub : https://docs.github.com/en/rest/actions/workflow-runs

## Réconciliation du ledger — 25 octobre 2026

Le projet Supabase ATLAS enregistre `20261025085932 / github_actions_rerun_ledger`, alors que le fichier main portait auparavant le timestamp `20261025200500`. Lecture SQL en production : tables `atlas_github_actions_reruns` et `atlas_github_actions_rerun_audit`, colonnes, contraintes, index et définitions des deux RPC correspondent à la migration versionnée; RLS est activée, sans politique client, et `EXECUTE` est réservé à `service_role`. Les deux tables contiennent zéro ligne.

Le ledger ne conserve pas de hash du fichier SQL; cette comparaison confirme l'équivalence observée des objets, pas l'identité octet par octet de la source appliquée. Le fichier est donc renommé dans le dépôt pour correspondre à la version enregistrée, et le workflow CI pointe vers ce chemin. Cette correction ne modifie pas la base de production. Vérifier en CI PG jetable avant fusion; aucune exécution live de relance n'a été effectuée.
