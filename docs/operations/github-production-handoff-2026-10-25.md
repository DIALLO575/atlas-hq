# GitHub Atlas — état Production et passation

Vérifié le **25 octobre 2026**. Pour la mise à jour détaillée dans Linear, voir [Atlas GitHub — état Production vérifié et passation](https://linear.app/shadoron/document/atlas-github-etat-production-verifie-et-passation-25-oct-2026-35af70a181aa).

## État livré

- Dépôt : [DIALLO575/atlas-hq](https://github.com/DIALLO575/atlas-hq)
- main : 9d64498dceb6d80e0c126854bc02e0bbcae4f1f0
- Vercel Production : [déploiement READY](https://vercel.com/diallo8/atlas-hq-preview/5RSyX1tFUVxkzjFdYXFdr9cU1KfY), SHA 9d64498, alias officiel atlas-hq-preview.vercel.app
- Application : [Atlas GitHub](https://atlas-hq-preview.vercel.app/apps/github)
- CI de livraison : [#688](https://github.com/DIALLO575/atlas-hq/actions/runs/40178705447), 5 contrôles réussis selon le compte rendu de livraison.

### Historique des PR

| PR | Résultat | Livrable |
| --- | --- | --- |
| [#43](https://github.com/DIALLO575/atlas-hq/pull/43) | Fusionnée (e308179) | Fondation GitHub Studio, OAuth, ledger et protections |
| [#44](https://github.com/DIALLO575/atlas-hq/pull/44) | Fusionnée (571f1fe) | Synchronisation de l’identifiant de migration et correctif du test OAuth |
| [#48](https://github.com/DIALLO575/atlas-hq/pull/48) | Fusionnée (fceacf6) | Command Deck, espaces GitHub séparés et PWA mobile |
| [#53](https://github.com/DIALLO575/atlas-hq/pull/53) | Fusionnée (7deb7a6) | Activation Production du parcours de création encadré |
| [#56](https://github.com/DIALLO575/atlas-hq/pull/56) | Fusionnée (9d64498) | Relance ciblée et approuvée des jobs GitHub Actions |
| #45, #47 | Fermées comme remplacées | Design/approbation Studio et diagnostics Actions repris dans #48 |

## Capacités présentes en Production

### Lecture GitHub

Le tableau de bord, les dépôts autorisés, les Pull Requests et l’inspection des changements utilisent les données de GitHub via le serveur Atlas. Les données et les accès sont limités au workspace, à l’installation et aux dépôts autorisés.

### Repository Studio

La création de dépôt personnel est raccordée à l’API serveur GitHub POST /user/repos. Les variables de contrôle ATLAS_GITHUB_STUDIO_WRITE_ENABLED, ATLAS_GITHUB_STUDIO_APPROVAL_ENABLED et ATLAS_GITHUB_STUDIO_OAUTH_ENABLED sont réglées à production dans Vercel Production.

Chaque écriture exige une session Atlas, le rôle owner/admin du workspace, une installation personnelle vérifiée, l’OAuth GitHub utilisateur, le droit effectif repository_creation:write et une approbation signée portant sur le nom exact du dépôt. Le ledger Supabase réserve l’opération et empêche les doubles POST. Une réponse incertaine reste à réconcilier; aucun retry automatique n’est lancé.

### Actions CI/CD

La lecture des workflows et des diagnostics est disponible. La PR #56 ajoute la relance ciblée d’un job échoué, après contrôle du workspace, du dépôt et du job, retape du nom du job, rôle owner/admin et droit Actions:write limité au dépôt. Chaque action passe par le ledger et une confirmation humaine. Les relances ne sont pas automatiques.

Actions: Read and write et Repository creation: write sont deux permissions distinctes.

### Expérience desktop et mobile

Le Command Deck sépare tableau de bord, dépôts, Pull Requests, création, Actions et connexions. La PWA mobile fournit une navigation tactile et des inspecteurs adaptés au petit écran.

## État de la base

Projet Supabase officiel ovzmmsxqfifneqqgnrzd.

Migrations présentes dans l’historique :

- 20261024225515_github_studio_operation_ledger
- 20261025085932_github_actions_rerun_ledger

RLS est actif sur les tables d’opérations et d’audit Studio/Actions. Au contrôle du 25 octobre, ces journaux étaient vides. Une installation Atlas était persistée comme repositories-ready avec une sélection de dépôts selected et les deux vérifications d’installation enregistrées. Cette ligne Supabase ne prouve pas que GitHub a accordé les droits d’écriture.

## Ce qui n’a pas encore été prouvé en direct

- Aucun dépôt n’a été créé comme test.
- Le droit effectif repository_creation:write pour l’installation GitHub et le callback OAuth enregistré dans l’App n’ont pas été confirmés par un parcours authentifié.
- Aucune relance réelle d’un job n’a été effectuée dans cette passation.
- La recette visuelle authentifiée sur un appareil mobile reste à faire.
- La page Production renvoie un utilisateur non connecté vers l’écran Atlas de connexion; aucune session authentifiée n’était disponible pour vérifier la dernière étape du parcours.

## Handoff — étapes suivantes

1. Ouvrir [Atlas GitHub en Production](https://atlas-hq-preview.vercel.app/apps/github) et se connecter.
2. Dans Repository Studio, démarrer l’OAuth GitHub. Vérifier que l’App et son installation accordent Repository creation: write. Si GitHub le demande, approuver la mise à jour de l’installation. La permission Actions ne suffit pas.
3. Confirmer le callback OAuth : https://atlas-hq-preview.vercel.app/api/apps/github/studio/oauth/callback.
4. Choisir un nom réel précis, vérifier l’aperçu, puis ressaisir ce nom pour l’approbation finale. Après un résultat incertain, réconcilier avec GitHub avant toute nouvelle tentative.
5. Tester une relance sur un job échoué sans risque, puis contrôler l’exécution GitHub et le journal.
6. Parcourir l’interface avec une session autorisée sur desktop et smartphone; inscrire les preuves dans les tickets Linear SHA-155, SHA-165, SHA-162, SHA-166 et SHA-167 avant de les clôturer.

## Remarque de maintenance

Certaines descriptions/commentaires de routes parlent encore de mode sandbox-only. Le contrôle d’activation actuel permet Production lorsque les trois flags Studio valent production. Corriger ces commentaires dans un prochain patch applicatif. Aucun code applicatif n’est modifié par cette note.
