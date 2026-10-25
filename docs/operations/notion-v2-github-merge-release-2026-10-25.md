# ATLAS HQ × Notion V2 — intégration GitHub de code et UX

*25 octobre 2026 · publication dans le code source, **pas un GO OAuth fournisseur***.

## Preuve GitHub

- PR de revue : https://github.com/DIALLO575/atlas-hq/pull/72 — **merged**.
- Commit `main` après squash : `3bec14be978a37989d2fb1e36a3018990d96b452`.
- Source candidate revue en amont : `236634de215536691d97ba7fa69c1fdf29ee85a2`, arbre `30db623a35128a5ffa24b586f24f8fa282554d98`. Ce candidat intégrait 49 fichiers Notion/doc de primitives et cockpit UX.
- Workflow GitHub Actions PR run [40210335758](https://github.com/DIALLO575/atlas-hq/actions/runs/40210335758) : **5 jobs réussis** : validate, notion-foundation-postgres, engine-foundation-postgres, github-studio-ledger-postgres, linear-oauth-postgres.
- Contrôles sur le SHA candidat : `npm test` **596/596**, `npm run typecheck`, `npm run lint`, `npm run build`, `git diff --check` passent ; `npm audit --omit=dev --audit-level=high` = **0 vulnérabilité de production signalée**.
- PR a été fusionnée avec vérification `expected_head_sha`; aucun fichier SQL, migration Supabase, variable Vercel ou secret OAuth modifié par cette PR.

## Fonctionnalités dans le code `main`

Lecture en mode REST restreint par compte ATLAS : pages/blocs et pagination manuelle, texte enrichi et Markdown filtré, médias bornés, schéma/ligne des bases et sources, vues liées à la bonne ressource avec filtres/tris appliqués par Notion. Interface SHA-189 : filtres locaux Pages/Bases/Sources, onglets Document et Markdown à la demande, cartes média, tableaux accessibles/défilants, vignettes de vues, messages exacts sur limites et manque de connexion, CSS responsive/ARIA.

Cela signifie **code disponible dans GitHub main**. Cela ne prouve **ni build Vercel production READY pour ce commit**, ni accès fournisseur Notion réel, ni rendu mobile éprouvé via vrai navigateur.

## Ce qui reste avant activation

1. **Vercel** : le statut `Vercel` de PR #72 est **en échec pour une limitation de build/quota** (lien d'upgrade), sans erreur de compilation GitHub. Le dernier déploiement READY observé de la branche `main` concernait le commit antérieur `c7ec18e...`. Vérifier les nouveaux déploiements avant toute affirmation de livraison effective.
2. **OAuth SHA-134** : vérifier client/secret/redirect/scopes et callback désactivé (valeur sensible à ne pas révéler), obtenir une autorisation explicite limitée à la page de test `ATLAS — TEST`, puis tester page non partagée, W1/W2, 403/404, refresh, déconnexion/révocation.
3. **Recette UI mobile/provideur** : écran authentifié 375/768/1440 px, clavier/focus/contraste, longs documents, médias expirés, source de données et vues natives réelles. Aucun écran de démonstration synthétique n'est autorisé.
4. **P1/P2** : gros médias >4Mo/Range/Office, complétude du Markdown/objets et interactions natives avancées, écritures approuvées humainement.

**Décision** : le code Notion V2 et son cockpit sont **fusionnés**, mais l'activation utilisateur et la recette fournisseur restent **NO-GO**. L'état « GitHub CI vert » ne remplace pas les validations OAuth et production.

Suivi : [SHA-182](https://linear.app/shadoron/issue/SHA-182), [SHA-189](https://linear.app/shadoron/issue/SHA-189), [SHA-134](https://linear.app/shadoron/issue/SHA-134). [Matrice historique des fonctionnalités](notion-v2-etat-reel-et-recette-2026-10-25.md).
