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
- Migration à versionner : `supabase/migrations/20261025200500_github_actions_rerun_ledger.sql`, à appliquer avant tout déploiement avec le flag activé.
- Variable serveur `ATLAS_GITHUB_ACTIONS_RERUN_ENABLED=production` sur la cible Production ; `sandbox` seulement sur Preview. Par défaut, route désactivée.
- La permission GitHub App Actions: Read and write doit être **approuvée par chaque installation**. L'utilisateur a annoncé l'avoir activée dans les paramètres de l'App ; la création du jeton vérifiera réellement l'accord de l'installation.
- Tester la relance sur un job en échec de dépôt de test avec session owner/admin avant un déploiement public.
- La présence du bouton ne signifie pas que l'utilisateur a perdu le contrôle : il doit confirmer explicitement, jamais automatiquement.

GitHub : https://docs.github.com/en/rest/actions/workflow-runs
