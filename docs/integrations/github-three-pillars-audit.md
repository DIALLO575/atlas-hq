# GitHub · Audit transversal des trois piliers

**Date : 25 octobre 2026.** Branche d'intégration `feat/github-three-pillars-hardening`. **Ne pas merger dans main ou déployer Production sans revue.**

## Rassemblement
- PR #45 : Repository Studio UI + approbation HMAC 5 minutes / permission GitHub App live vérifiée (écritures sandbox uniquement, OFF par défaut).
- PR #47 : GitHub Actions diagnostic read-only à repo ID restreint.
- Déjà sur main : Pull Requests avec inspecteur diff et Repository Studio en prévisualisation.

Cette intégration consolide les deux PR existantes dans un seul parcours visuel : **PR → Studio → Actions**. L'onglet Actions ne partage **pas** les jetons de PR (sous-autorisation Actions:Read distincte).

## Corrections identifiées et appliquées
1. **Changement d'installation** : Studio et Actions sont remontés via une clé workspace+installation ; aucune ancienne prévisualisation ou approbation Studio ne survit au changement de compte GitHub.
2. **Inspecteur PR** : le fichier ouvert automatiquement doit figurer dans les 35 fichiers du navigateur initial, y compris si les premiers fichiers sont binaires ; la ligne Git diff `+++` ou `---` est un en-tête, pas une ligne de code ajouté/supprimé ; indicateurs aria pour liste PR et fichiers, état de chargement visible.
3. **Actions — navigation rapide** : interruption immédiate des requêtes runs/jobs à la sélection d'un autre dépôt, purge des jobs et de la sélection précédente ; installation différente entraîne un remontage isolé du panneau.
4. **Actions — intégrité** : token réduit strictement à `actions:read` (le retour `actions:write` est refusé), job avec `run_id` incompatible refusé avant diffusion ; erreurs de quotas GitHub distinguées des refus de permission.
5. **Actions — diagnostic** : priorité aux jobs en échec, filtre cohérent avec les statistiques (annulations distinctes), messages d'erreur sécurisés, lecteurs d'écran informés lors des chargements.
6. **Design global** : onglets et sélection de détails plus visibles, navigation au clavier, CSS responsive et réduction des animations si préférence OS.

## Non inclus
- Création d'un dépôt personnel en Production ; GitHub App user OAuth et sandbox E2E encore nécessaires.
- Rerun d'un workflow ; demander séparément `Actions:Write` et approbation humaine, conformément à SHA-167.
- Logs de CI bruts au navigateur ; liens seulement vers GitHub.
- Permissions GitHub App modifiées : consentement du propriétaire requis.

## Vérification et limitations
Tests Node mock et inspections statiques, CI GitHub (test, typecheck, lint, build, scan secrets, PostgreSQL). **Un E2E navigateur authentifié sur une Preview** et un test du grant GitHub Actions:Read réel restent nécessaires avant fusion.

Liens :
- https://github.com/DIALLO575/atlas-hq/pull/45
- https://github.com/DIALLO575/atlas-hq/pull/47
- https://linear.app/shadoron/issue/SHA-166
- https://linear.app/shadoron/issue/SHA-167
