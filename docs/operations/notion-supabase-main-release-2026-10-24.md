# ATLAS HQ — Mise à jour Supabase Notion et fusion main — 24 octobre 2026

## Périmètre et provenance

- Application : [DIALLO575/atlas-hq](https://github.com/DIALLO575/atlas-hq), intégration [PR #32](https://github.com/DIALLO575/atlas-hq/pull/32).
- Ticket principal : [SHA-111](https://linear.app/shadoron/issue/SHA-111), étapes SHA-120 à SHA-123 ; webhook SHA-124 et MCP SHA-125 non livrés.
- Projet Supabase officiel : `ovzmmsxqfifneqqgnrzd`. Les migrations ont été exécutées après autorisation explicite et validation CI sur PostgreSQL jetable.
- Avant : 15 migrations ; maintenant 19 enregistrées. Conserver les noms et **versions enregistrés** ci-dessous lors des futurs `db push`/diff.

## Migrations réellement appliquées

| Version enregistrée en production | Nom | Effet |
| --- | --- | --- |
| `20261024140402` | `atlas_notion_connection_foundation` | Durcissement des GRANT du registre générique ; lien workspace/owner ; tables RLS serveur uniquement pour state et jetons Notion |
| `20261024140414` | `atlas_notion_atomic_store` | RPC service-role de persistance transactionnelle de connexion et de jetons chiffrés |
| `20261024140418` | `atlas_notion_revoke_connection` | Déconnexion locale atomique vérifiée par version |
| `20261024140422` | `atlas_notion_refresh_gate` | Verrou durable de renouvellement, rotation de la paire, fail-closed |

Les fichiers `supabase/migrations/20261024140402_*.sql` etc. correspondent aux versions enregistrées : les préfixes du dépôt ont été réconciliés avec l'historique Supabase, **sans rejouer** les migrations. Les tests CI utilisent les nouveaux chemins.

## Vérifications effectuées en lecture seule après application

- `atlas_notion_connections` et `atlas_notion_oauth_states` : RLS activée ; pas de privilèges Data API directs pour `anon` ou `authenticated`, accès `service_role` disponible.
- Les cinq fonctions `atlas_notion_*` : `EXECUTE` réservé à `service_role`, `SECURITY INVOKER`.
- `atlas_connections` : `authenticated` ne peut plus `INSERT` ni modifier toute la table ; le droit `UPDATE(account_label)` subsiste, pas `UPDATE(status)`.
- Comptage juste après migration : 0 connexion et 0 état OAuth Notion, 0 connexion générique, 0 objet provider, 0 curseur ; l'installation GitHub existante reste enregistrée (1), aucune connexion Linear.
- Conseiller de sécurité Supabase : cinq avis informatifs « RLS sans policy » correspondant aux tables réservées au serveur (dont Notion), plus le rappel de protection des mots de passe compromis désactivée.
- CI de la branche avant rapprochement des versions : [#418 — success](https://github.com/DIALLO575/atlas-hq/actions/runs/40100406669), dont tests SQL de concurrence. Après rapprochement des chemins, recontrôler la CI avant fusion.

## Statut réel des fonctionnalités

- Le code du connecteur Notion REST, OAuth, stockage chiffré, recherche par titre, lecture de blocs, déconnexion et renouvellement protégé est préparé pour `main`.
- Aucune autorisation Notion réelle de bout en bout n'a encore été testée. La page n'est pas une preuve de connectivité ; l'activation nécessite la configuration serveur, les secrets, la redirection OAuth et `NOTION_OAUTH_CALLBACK_ENABLED=true` (désactivé par défaut).
- Les autorisations restent par utilisateur et workspace ATLAS, et seulement sur les ressources Notion effectivement partagées.
- **GitHub main ≠ Vercel Production.** Le statut Vercel de la tête de la PR affichait un échec de build lié au quota, tandis que la CI GitHub et les previews Netlify étaient vertes. Aucun déploiement ou preuve d'autorisation live n'est implicite.
- Ne pas créer une nouvelle migration ou réappliquer l'une de ces versions pour « réparer » ; créer une migration corrective versionnée si nécessaire.

## Activation ultérieure (hors de cette livraison)

1. Vérifier une configuration OAuth Notion de test et un utilisateur ATLAS autorisé ; garder les secrets dans l'environnement serveur.
2. Tester consentement OAuth, stockage, lecture d'une page explicitement partagée, refus cross-workspace, déconnexion/révocation et rotation de refresh token sur un espace de test.
3. Suivre le quota Vercel et les alias avant de déclarer le parcours utilisable sur le domaine officiel ; pas de tentatives répétées si 402.
4. Prévoir une file durable de révocation externe si nécessaire ; planifier SHA-124 (webhooks) et SHA-125 (MCP).
5. Ne jamais annoncer qu'un agent Notion ou la synchronisation Notion est actif à ce stade.

## Rollback / incident

Les nouvelles tables sont inoccupées immédiatement après la migration. Le durcissement des privilèges sur les trois tables génériques est intentionnel ; vérifier les clients qui dépendraient d'écritures directes. En cas de problème, isoler l'accès applicatif et préparer un correctif SQL reviewé plutôt qu'effacer les migrations ou réactiver des privilèges larges. Pas de rollback destructeur automatique.
