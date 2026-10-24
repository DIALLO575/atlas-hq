# GitHub Studio — Gate OAuth utilisateur pour création personnelle

**Document d'architecture correctif, 24 octobre 2026 — aucune écriture live activée.**

## Décision de sécurité

L'endpoint GitHub.com `POST /user/repos` (`X-GitHub-Api-Version: 2026-03-10`) supporte les **GitHub App user access tokens**, pas les jetons d'installation ordinaires. Un jeton installation ne doit donc plus être transmis à cet endpoint. Le module `createPersonalRepository` exige désormais un `userAccessToken` serveur, vérifie l'installation avec le JWT de la GitHub App, puis valide `GET /user` avec le jeton utilisateur afin de confirmer l'identité GitHub exacte du propriétaire avant le POST.

## Conséquence pour Atlas

La connexion GitHub actuelle ne conserve pas les jetons OAuth utilisateur : elle n'autorise donc pas encore les écritures GitHub au nom de l'utilisateur. `prepareGitHubStudioMutation` lève `USER_TOKEN_REQUIRED` *avant* toute réservation dans PostgreSQL si l'authentification utilisateur n'a pas été réalisée. Aucun jeton ne peut être fourni à travers la requête JSON publique ni exposé au navigateur.

Le chemin `/api/apps/github/studio/repositories/execute` reste **OFF par défaut, Preview sandbox uniquement**, et sans autorisation serveur GitHub utilisateur il n'écrit rien. Les validations du provider sont actuellement des tests mock ; une création GitHub réelle ne sera pas tentée avant approbation et sandbox.

## Travail requis

1. Implémenter un flux OAuth **GitHub App user-to-server** explicitement dédié aux écritures, avec `state` anti-CSRF consommable une seule fois, PKCE lorsqu'applicable, validation du callback et liaison actor Atlas ↔ identité GitHub vérifiée.
2. Choisir stockage de jetons chiffrés et révocables, ou autorisation éphémère au moment de la création. Interdire les jetons utilisateur dans les paramètres de requête ou dans les logs.
3. Mettre en place expiration/renouvellement et suppression sur révocation ; ne jamais utiliser la paire OAuth actuellement éphémère comme preuve d'autorisation permanente.
4. Demander les permissions de création dédiées auprès du propriétaire de la GitHub App, puis vérifier le compte GitHub User via `GET /user` avant un test personnel sandbox autorisé.
5. Garder l'installation GitHub comme vérification de sélection du dépôt après création ; le finaliseur atomique reçoit uniquement un ID de dépôt contrôlé.

## Références vérifiées

- https://docs.github.com/en/rest/repos/repos?apiVersion=2026-03-10#create-a-repository-for-the-authenticated-user
- https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/authenticating-with-a-github-app-on-behalf-of-a-user
- https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-user-access-token-for-a-github-app
- https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/refreshing-user-access-tokens

## Acceptance criteria

- Sans jeton OAuth utilisateur serveur, zéro `POST /user/repos` et **zéro nouvelle opération SQL**.
- Token GitHub utilisateur d'un autre login : refus avant POST.
- Une fois OAuth configuré, sandbox exclusif, confirmation explicite, ID/fingerprint et CAS idempotent.
- Aucune permission sensible ni jeton brut transmis au client ou aux logs.
