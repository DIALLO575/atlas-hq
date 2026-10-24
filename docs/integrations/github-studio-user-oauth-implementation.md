# SHA-165 — Autorisation GitHub App user-to-server (sandbox)

24 octobre 2026. **Code de PR en brouillon ; pas de migration ni d'autorisation réelle.**

## Fonctionnement implémenté

- `POST /api/apps/github/studio/oauth/start` est bloqué sauf si `VERCEL_ENV=preview` et `ATLAS_GITHUB_STUDIO_OAUTH_ENABLED=sandbox`. Il vérifie Origin, workspace propriétaire/admin et installation enregistrée `repositories-ready`; le workspace et l'installation doivent être ceux configurés par le serveur pour la sandbox.
- Réutilisation du **ledger OAuth existant** `atlas_github_connect_attempts` pour stocker une corrélation signée `state` à usage unique, inscrite avec `stage=oauth` et les identités Supabase + installation.
- Le code génère un verifier PKCE S256 serveur, lié au state/acteur/workspace/installation dans un cookie **AES-256-GCM** HttpOnly Secure SameSite=Lax, valable 15 minutes. La clé est dérivée par HKDF du secret serveur `GITHUB_INSTALL_STATE_KEY`, séparation de domaine entre cookie d'autorisation et cookie d'accès.
- `GET /api/apps/github/studio/oauth/callback` vérifie l'état signé, le cookie, l'identité Supabase, consomme atomiquement l'essai avant l'échange du code OAuth (empêche les callbacks rejoués), et valide ensuite `GET /user` et `GET /user/installations` afin de prouver le propriétaire et la permission `repository_creation:write`.
- Le jeton d'accès GitHub App utilisateur est encapsulé dans un second cookie chiffré HttpOnly, Secure, SameSite=Strict, chemin restreint à `/api/apps/github/studio/repositories/execute`, pour **au maximum dix minutes** ou la durée de vie fournisseur si plus courte. Aucun refresh token n'est conservé. Il n'entre pas dans la base Atlas, les logs ni le JavaScript navigateur.
- La route d'exécution sandbox relit ce cookie et le compare au workspace, à l'acteur Supabase et à l'installation ; le token n'est jamais accepté dans le JSON client. Les contrôles d'Origin, confirmation explicite, idempotence, rôle et installation restent obligatoires.

## Mise en service future (non exécutée)

1. Enregistrer dans les paramètres GitHub App le callback HTTPS exact `https://<preview-approuvé>/api/apps/github/studio/oauth/callback`. Ne **pas** remplacer le callback déjà utilisé pour la connexion lecture seule.
2. Appowner valide la permission de création pour le compte de test, réautorise l'installation au besoin.
3. Utiliser une Preview HTTPS **stable** avec `ATLAS_PUBLIC_ORIGIN` correspondant, `VERCEL_ENV=preview`, `ATLAS_GITHUB_STUDIO_OAUTH_ENABLED=sandbox`, `ATLAS_GITHUB_STUDIO_WRITE_ENABLED=sandbox`, et les IDs sandbox exacts définis par l'opérateur.
4. Isoler les migrations SQL et les secrets dans un projet Supabase sandbox ; aucun déploiement automatique sur le Supabase officiel.
5. Terminer la revue de sécurité (test de replay entre navigateurs, erreurs GitHub, grants revoked, audit, rate limiting, expérience UI), puis lancer un E2E avec **consentement explicite** du propriétaire.

## Limites
- Aucun bouton UI d'exécution GitHub : la connexion Studio normale est toujours read-only.
- `GET /user/installations` refuse par précaution les installations qui dépassent une page (100) au lieu de risquer une confusion de compte.
- Le cookie de token peut être renvoyé dans une fenêtre de 10 minutes ; avant production envisager une consommation transactionnelle unique du grant et une révocation proactive.
- Si l'installation est retirée ou si les permissions changent, les appels provider doivent échouer et l'opération reste à réconcilier, sans POST automatique.
