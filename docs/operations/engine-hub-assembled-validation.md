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
