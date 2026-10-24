# GitHub Studio — endpoint sandbox d'exécution verrouillé (SHA-155)

Date : 2026-10-24. **NON activé. Aucun endpoint Production ne doit exécuter des écritures.**

La route `POST /api/apps/github/studio/repositories/execute` permet une future création dans un environnement **Vercel Preview exclusivement**, mais elle refuse toute demande tant que `ATLAS_GITHUB_STUDIO_WRITE_ENABLED=sandbox` n'est pas activé **explicitement**. `VERCEL_ENV=production` bloque le chemin, même si le flag est mal configuré.

Pour un essai contrôlé ultérieur, il faudra : `ATLAS_PUBLIC_ORIGIN` exact du site Preview HTTPS, `ATLAS_GITHUB_STUDIO_SANDBOX_WORKSPACE_ID` et `ATLAS_GITHUB_STUDIO_SANDBOX_INSTALLATION_ID` approuvés, migrations PostgreSQL testées et **appliquées seulement sur une base isolée**, permission GitHub App `repository_creation:write` approuvée et installation personnelle sandbox.

Chaque requête nécessite : session Supabase (getUser), rôle owner/admin actuel du workspace, binding installation prêt, Origin correspondant, JSON strict, header UUID `Idempotency-Key`, champ `confirmed:true` (à ajouter uniquement dans un vrai parcours UI de confirmation future), puis validation de la demande. Aucun jeton, secret, URL GitHub arbitraire ou erreur interne n'est envoyé au navigateur.

En cas de POST fournisseur à résultat incertain, l'opération conserve son statut `reconciliation_required`. La route ne refait pas le POST. Si le dépôt a été créé, le serveur vérifie le grant **live** avant d'appeler le finaliseur atomique. La route ne modifie pas le GET GitHub existant ni le formulaire de prévisualisation.

**Limites avant GO réel :** procédures d'exploitation / réconciliation après interruption, test sandbox réel, consentement GitHub App, preuve d'isolation Supabase staging, rate limiting et capacité de résolution d'actions bloquées. Aucun déploiement Production ni migration officielle ne doit être déclenché automatiquement depuis ce patch.
