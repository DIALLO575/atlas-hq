# SHA-128 — Préparation d'équipe et revue des membres

Cette tranche dépend de la PR51. Elle étend le parcours de demande auditée aux
équipes sans créer d'équipe, canal, agent, conversation ou mission dans MAUSBOT.
La PR doit être revue avec la proposition SQL commune ; aucune proposition de
ce lot n'est appliquée à Supabase. KMS toujours différé, moteur verrouillé.

## Périmètre

Dans `/agents`, choisir Agent ou Équipe. Une équipe contient un nom, une
description et de 1 à 12 profils avec identifiant unique, nom, rôle, description
et couleur autorisée. Les champs restent des métadonnées non fiables, pas des
autorisations ou instructions système. Ni outils, modèles, soul, chemins,
URL, grants Full, fichiers, backups, prune ni champs arbitraires ne sont acceptés.
L'équipe est préparée pour le contrat existant `openmaus.team` v2 en mode ajout.
La route source future `teams.import?mode=add` est planifiée seulement, jamais appelée.

`POST /api/engines/team-requests` accepte les quatre identifiants de contexte et
le manifest borné à 64 KiB. Elle utilise la session Supabase utilisateur,
owner/admin, origine identique et validation profonde. Le helper réutilise
`planTeamChannelMutation` puis borne le périmètre initial. Aucun endpoint de
provisionnement générique ou d'activation n'est ajouté.

## SQL partagé et défense en profondeur

La transaction partagée est désormais appliquée dans la migration
`supabase/migrations/20261025114614_atlas_engine_agent_request_v1.sql`.
La proposition historique `supabase/proposals/engine-agent-request-v1.sql` est
étendue plutôt que de dupliquer la transaction de PR51. Des wrappers fixent
`agents.create` ou `teams.import` ; le cœur privé partagé n'est pas exécutable
par authenticated/anon. Les wrappers publics sont invoker ; leurs implémentations
privées definer vérifient l'identité/session actuelle et appellent le cœur.

Le serveur SQL revalide lui-même la structure et les clés à chaque profondeur,
les types, versions, tailles, membres uniques et couleurs. Il normalise les
textes puis fixe le hash JSONB, le run awaiting-approval, la demande pending15min
et l'audit dans une transaction. Même requestId + même profil => rejeu sans
nouveau run/audit ; même ID et contenu/primitive différent => refus.

Le résumé d'équipe est immuable et couvert par le digest. Le reviewer distinct
voit nom, description et tous les profils/couleurs avant décision PR40. Le nom
historique de la RPC `atlas_engine_pending_agent_profiles` est conservé pour
compatibilité mais elle renvoie désormais les deux types de profils. Le BFF
valide les équipes renvoyées ; détails manquants/invalides bloquent l'approbation.
Aucune décision ne crée d'outbox, n'autorise un run ni n'appelle un moteur.

## Preuves et limites

Tests exécutables BFF/normalisation : corps/origine/membership, erreurs masquées,
manifest hostile, privilèges cachés, soul/tools/model/cwd/URL, membres dupliqués,
quantités hors bornes et compatibilité avec le plan import add-only existant.
PG17 jetable : validations SQL directes sans passer par le BFF, détail reviewer,
immutabilité/hash, rejeu/changement, refus cross-tenant et cœur générique privé,
décision PR40 sans dispatch, concurrence avec un run/un audit/zéro outbox.
Les anciens tests agents restent exécutés après refactorisation du cœur partagé.

Pas encore validé : vraie Auth/staging et test visuel authentifié, application SQL,
déploiement, import MAUSBOT, modèle/outils/droits effectifs, attribution mission à
équipe réelle, canaux et réception des résultats. Le formulaire ne conserve pas
un brouillon entre rechargements ; un nouvel ID représente une nouvelle demande.
Ne pas annoncer d'équipe créée sur la seule base du reçu de demande.


## Course de contraintes uniques corrigée

La première CI de cette tranche a révélé qu'un INSERT concurrent peut rencontrer
l'index unique composite tenant/run/instance, même si `ON CONFLICT(id)` cible la
clé primaire. Le cœur utilise désormais `ON CONFLICT DO NOTHING` sans cible,
puis verrouille et compare l'intention complète déjà stockée. Il ne transforme
pas un conflit de contenu/tenant en succès. Cette correction s'applique aussi aux
demandes agents de PR51 ; intégrer les tranches avec cette correction et ne pas
considérer l'ancienne CI comme preuve d'absence de cette course.
