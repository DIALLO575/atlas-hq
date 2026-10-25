# Recette live des demandes agent/équipe — SHA-150

## État et préconditions

La migration de demandes `20261025114614_atlas_engine_agent_request_v1` est
appliquée sur le projet Supabase ATLAS désigné comme production. Elle expose les
RPC authentifiées `atlas_engine_request_agent` et `atlas_engine_request_team`;
elles créent une demande en attente, jamais un agent MAUSBOT ni une entrée d'outbox.

**Aucune recette Auth réelle n'a été exécutée.** PR #60 reste en brouillon/non
fusionnée, le SHA Web servi n'est pas vérifié et aucun staging isolé n'est identifié.
Ne pas créer de demande live tant que le Founder n'a pas confirmé une cible isolée
et le groupe de comptes, ou autorisé explicitement une demande de test en production.

La recette doit s'arrêter avant tout appel réseau vers MAUSBOT. Aucun secret ou JWT
ne va dans les champs de profil, logs, commentaires ou captures. Aucun `service_role`
dans le navigateur ou dans les étapes exécutées comme demandeur/reviewer.

## Participants et données de test

- Demandeur R : compte Supabase Auth réel, membre owner/admin du workspace de test.
- Reviewer A : autre compte owner/admin du même workspace, différent de R.
- Reviewer B : troisième compte distinct pour la course approve/reject. Si le scénario
  concurrentiel est testé uniquement avec deux appels du Reviewer A, consigner cette
  limite au lieu de prétendre avoir testé deux reviewers.
- Mission prévue/active et instance `mausbot` hors ligne dans le même workspace.
- Profil sans information confidentielle, outils, modèles, permissions, prompt,
  URL ou credentials. Pour un groupe, manifest v2 minimal avec clés/couleurs autorisées.

Si seule la production est disponible, ne pas utiliser de vrais objets de travail :
obtenir une confirmation explicite avant de créer une demande de recette, car le run,
l'approbation et l'audit seront conservés. Ne pas supprimer l'audit pour nettoyer.

## Séquence positive

1. Vérifier le SHA réellement servi, la version de migration et que les routes/API
   de PR #60 sont déployées dans la cible choisie. Faire un login séparé pour R,
   Reviewer A et, pour la course, Reviewer B.
2. R soumet un profil borné avec un UUID `requestId` unique. Garder les quatre IDs
   de contexte provenant de la cible; ne pas forger l'acteur ou le rôle.
3. Vérifier la réponse `pending`, `created=true`, `can_dispatch=false`. Vérifier
   l'empreinte/résumé serveur et exactement un événement `engine.approval.requested`.
4. R rejoue la même requête avec le même `requestId` et le même contenu : résultat
   existant (`created=false`), sans second run ni nouvel audit. Rejouer le même ID
   avec un profil changé : refus.
5. R tente de lire ou décider sa propre demande : refus/aucun détail. Reviewer A
   reçoit le profil exact et l'empreinte puis approuve ou refuse une fois.
6. Pour le test de concurrence, une demande séparée est présentée simultanément à
   Reviewer A et Reviewer B avec décisions opposées. Il doit y avoir un gagnant,
   un audit de décision, run toujours non-dispatché et aucun changement d'outbox.
7. Vérifier l'état final sans appeler le transport MAUSBOT : instance toujours
   offline, zéro dispatch, aucun agent/groupe/canal créé dans MAUSBOT.

## Cas de refus

Exécuter chaque scénario avec des comptes/workspace jetables isolés; ne pas révoquer
les sessions ordinaires d'un utilisateur de production.

- Révoquer la session de R puis retenter avec son ancien JWT : refus.
- Retirer le rôle owner/admin de R puis soumettre une nouvelle demande : refus.
- Utiliser mission, instance ou workspace croisé : refus sans création de run/audit.
- Utiliser un manifest invalide, champ caché, permission, outil, modèle ou clé dupliquée :
  refus.
- Laisser expirer la demande (15 minutes) puis charger/décider : refus.
- Soumettre à nouveau le même profil/UUID après révocation : refuser si la session ou
  le rôle courant ne le permet plus.

Les scénarios d'échec d'audit transactionnel, fixtures Auth révoquées et tests
multi-connexion destructifs restent prouvés uniquement en PostgreSQL jetable; ne pas
injecter de trigger de panne dans la production.

## Preuves à conserver

- Environnement et SHA servi, version(s) de migration et date UTC.
- Identifiants pseudonymisés des rôles (R/A/B), jamais JWT, cookies ou tokens.
- `requestId`, résultat HTTP, `created`, décision, `can_dispatch` et empreinte.
- Nombre d'événements d'audit liés au run et état/compte de l'outbox avant/après.
- Résultat des révocations, du rôle retiré, de l'expiration et des décisions concurrentes.
- Confirmation de l'absence de requête réseau/dispatch MAUSBOT.

Ne fermer SHA-150 qu'après revue de ces preuves avec la séparation explicite entre
migration appliquée, Web déployé, Auth testé et exécution MAUSBOT encore verrouillée.
