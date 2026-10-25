# Engine Hub — validation assemblée avant connexion

Cette branche rassemble les livraisons proposées sans les fusionner dans main :

| Source | Commit inclus | Périmètre |
| --- | --- | --- |
| main vérifié à la reprise | 7deb7a6ef84dca622df91774c170ec49eca75d79 | Socle actuel, modifications GitHub des autres workers conservées |
| PR46 | 7f82730508fe4d5cfb048fa749eeaa66c8ace276 | Décisions concurrentes, audit unique, zéro dispatch |
| PR49 | 59e50676da7ba005a3dcde273c39ab4e6b6d516e | Secret serveur simple, rotation/révocation locale, KMS différé |
| PR50 | 3d158f17663f021839002d6d282b24710eea5148 | Worker simulé, baux/fencing, crash et déduplication |
| PR51 + PR52 | 4c893e3c05a53866fcf11e485805871bf527856a | Demandes agents/équipes et correction de concurrence sur index unique composite |

L'objectif est de remplacer la seule preuve de CI par branche par une preuve sur
un arbre commun. Aucun changement des domaines GitHub extérieurs au chantier
Engines n'est introduit ; ils sont repris depuis main. Les PR sources restent
ouvertes tant qu'une décision d'intégration n'a pas été prise. Éviter leur double
intégration si cette branche est retenue ; comparer les arbres et les historiques.

La CI Engines applique les sept migrations versionnées puis la proposition de
profils dans PostgreSQL 17 **jetable**. Elle vérifie successivement les demandes
d'agents et d'équipes, leurs rejeux concurrents, les processus worker simulés et
leurs crashes, puis les décisions concurrentes. Les tests Node, TypeScript,
lint et build portent sur le même arbre assemblé. Le setup Node de la CI est
partagé entre les deux suites de processus.

Validation locale de l'arbre assemblé : 478 tests Node réussis, typecheck, lint
et `git diff --check` réussis. Build local tenté : arrêt du runtime avec
`ENOENT uv_resident_set_memory`, comme sur les tranches précédentes ; ce résultat
n'est pas un build réussi. La preuve de build et de PostgreSQL assemblés doit
venir de la CI de cette branche et être consignée dans Linear/SHADORON.

Le fichier `supabase/proposals/engine-agent-request-v1.sql` reste une proposition,
pas une huitième migration appliquée. Ne pas le rejouer en production : revue,
cible identifiée, historique vérifié, migration additive et coordination API/SQL
restent nécessaires. Aucun token réel, SQL Supabase, merge main ou déploiement
explicite n'est réalisé par ce lot.

Le secret simple n'est pas branché au worker. Celui-ci accepte uniquement son
transport simulé et un stockage marqué comme fixture jetable ; sa réussite ne
certifie aucun effet externe. Les demandes agents/équipes restent des demandes
de revue : pas d'agent moteur créé, ni d'outbox, ni de dispatch. Les écritures et
exécutions MAUSBOT restent bloquées, y compris avec un flag d'environnement.

Après validation assemblée : resolver serveur et liaisons mission/agents/outils/
ressources, identité SQL privée du worker, staging et vrais comptes distincts,
recette UI/Auth, puis gate SHA133. La connexion réelle SHA105 et la preuve SHA106
restent en aval et demandent leur autorisation explicite.

## Reprise vérifiée — PR #60 (25 octobre 2026)

La PR #60 remplace cet assemblage initial, basé sur un main antérieur. Base
revérifiée : `9d64498dceb6d80e0c126854bc02e0bbcae4f1f0`. HEAD :
`4a1ae7b2b52796d1c778dfb23f7cb442407a1c57`. La PR reste draft, ouverte et non
fusionnée. CI Actions `40189365203` a réussi ses cinq jobs : validation,
PostgreSQL Notion, ledger GitHub, OAuth Linear et Engines. Le job Engines passe
les fondations SQL en PostgreSQL jetable, les demandes/rejeux, les décisions
concurrentes, les révocations concurrentes du contexte et les workers simulés
après crash. Le job de validation inclut tests, typecheck, lint, build, audit des
dépendances et détection de secrets. L'assertion d'audit de la première exécution
avait échoué; elle a été corrigée pour distinguer affectation et grant primitif,
puis la CI finale a réussi.

Les 513 tests Node/typecheck/lint/diffcheck locaux avaient réussi avant cette
correction d'assertion. La CI finale vérifie le commit corrigé. Netlify a publié
les previews de la PR. Vercel a refusé une preview à cause de sa limite API
quotidienne; aucune preview Vercel n'est donc confirmée pour ce commit. Aucun
déploiement de production n'est confirmé.

Le schéma d'affectation mission→agent et l'allowlist primitive restent du SQL
proposé, testé seulement dans PostgreSQL jetable; rien n'a été appliqué à
Supabase. Le resolver prépare des métadonnées et échoue sans affectation/grant
actif; il n'est branché ni à une route, ni au worker, ni à un fournisseur réel.
`canDispatch:false` demeure. Aucun agent, équipe, canal ou mission n'a été créé
dans MAUSBOT. KMS reste différé et le verrou d'exécution reste fermé. La CI ne
permet pas de conclure à une migration appliquée, une interface déployée ou un
parcours Auth/exécution testé de bout en bout.

Suite ordonnée : revue/intégration coordonnée de PR #60 pour éviter les doublons
avec ses PR sources; endpoint et droits d'écriture contrôlés; staging identifié
et vrais demandeur/reviewer distincts; adaptateur réel d'accès aux ressources et
lecteur SQL privé minimal; worker durable. Aucun ticket n'est clôturé sur cette
seule preuve CI.

## Recherche de cible staging — Supabase, lecture seule (25 octobre 2026)

L'inventaire connecté trouve un projet actif `DIALLO575's Project` en eu-west-1,
PostgreSQL 17.11. Il contient les migrations ATLAS et sept migrations Engines,
dont le fencing. `list_branches` sur ce projet ne retourne aucune branche de
développement. Son nom ne permet pas de le qualifier comme staging; il reste une
cible non identifiée pour la recette.

Le projet `VELMO-STAGING` trouvé dans l'autre compte est inactif et associé à
VELMO. Il n'est pas utilisé pour ATLAS. Cette vérification n'a changé ni lu
aucune table ou utilisateur. Aucun DDL, réglage ou test Auth n'a été exécuté.
La création d'une branche Supabase pouvant entraîner des frais, il faudra d'abord
obtenir un devis et l'accord correspondant; aucune branche n'a été créée.

Le devis Supabase en lecture seule du 25 octobre 2026 pour une branche dans
l'organisation du projet ATLAS indique `0,01344 par heure` (type branch,
facturation horaire). Ce résultat est une estimation retournée par le fournisseur,
pas une facture ni la création d'une ressource. Sa devise et ses conditions
restent à confirmer dans Supabase avant création. Aucune branche n'a été créée;
attendre l'accord explicite sur les frais.

## Migration de demandes agent/équipe appliquée en production — 25 octobre 2026

À la demande explicite du Founder, la migration additive
`20261025114614_atlas_engine_agent_request_v1` a été appliquée au projet Supabase
ATLAS désigné comme production. L'historique Supabase confirme cette version.
La colonne `request_summary`, les RPC authentifiées de demande agent/équipe et
lecture reviewer, ainsi que le trigger d'immutabilité ont été vérifiés après
l'application. Les wrappers sont `SECURITY INVOKER`; authenticated a EXECUTE,
anon n'en a pas; le cœur générique privé n'est pas appelable par authenticated.
Les advisors de sécurité n'ont pas ajouté de nouveau finding (19 avis INFO RLS
préexistants sur des tables sans policy, y compris des tables privées fail-closed).

Cette migration n'a inséré aucune demande et n'a créé aucun enregistrement
d'outbox. La création réelle par deux comptes, la recette UI/Auth, l'expiration,
le retrait de rôle/session, la concurrence et l'audit unique restent à tester.
Le code PR #60 est encore draft/non fusionné et aucun déploiement n'est confirmé.
La migration d'affectation mission→agent reste une proposition non appliquée;
elle est séparée, privée et n'a pas encore de writer.

Pendant le rapprochement, l'historique Supabase a également montré la migration
`atlas_n8n_automation_registry` en version `20261025114449`, absente de main
(`9d64498`). Elle n'a pas été appliquée par cette tranche; source et propriétaire
doivent être rapprochés avant la prochaine synchronisation complète du schéma.
