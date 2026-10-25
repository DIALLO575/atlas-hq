# SHA132 — prévalidation serveur du contexte d'un agent

Le module `packages/engine-core/src/context-resolver.mjs` prépare un contexte
**métadonnées uniquement** pour un run existant visant un agent. Il n'est relié à
aucune route, au worker ou au transport MAUSBOT. Il ne crée aucune affectation de
mission et ne transforme jamais une approbation en autorisation d'exécuter.

## Périmètre de cette tranche

Deux primitives du catalogue existant sont acceptées :
`conversations.messages.list` et `conversations.messages.send`. Elles viennent du
run SQL, jamais du body. Les canaux, groupes multi-agents, imports de profils et
autres primitives restent hors de ce premier resolver. Les profils préparés en
PR51/52 ne sont pas des agents enregistrés et ne permettent pas d'inventer une
identité moteur.

1. `authenticate(session)` vérifie l'identité serveur et renvoie acteur,
   session et expiration du JWT. Aucun `actorId`, rôle, primitive, identifiant
   moteur, token ou booléen `approved` n'est accepté dans la sélection.
2. `createEngineContextRepository({query})` exécute un SELECT paramétré sur
   runs, instances, missions, memberships, `auth.sessions` et la table privée
   `atlas_engine_agent_bindings`. La proposition
   `supabase/proposals/engine-mission-agent-assignment-v1.sql` ajoute la relation
   persistante mission→agent (`atlas_engine_mission_agents`) et son allowlist
   primitive (`atlas_engine_mission_agent_primitives`). Le SELECT exige une
   affectation active exacte et le droit actif sur la primitive du run, en plus
   du même workspace/instance, demandeur exact, session active, owner/admin
   actuel, mission planned/active, instance MAUSBOT non suspendue et run non terminal.
   Aucune colonne de credentials, payload, profil ou contenu externe n'est lue.
3. Un adaptateur serveur `authorize` **obligatoire** doit vérifier les connexions
   Apps, droits de l'acteur, révocations et versions de toutes les ressources.
   Même sans ressource externe, cet adaptateur reste obligatoire pour confirmer
   les droits applicatifs hors de l'affectation SQL.
   La sélection n'est jamais une preuve de droit. Cet adaptateur concret reste
   à implémenter ; aucun `allow` par défaut n'est livré.
4. Le SQL est relu après cet adaptateur. Toute disparition de session, retrait
   de rôle, clôture de mission, suspension ou remplacement de liaison invalide
   le résultat. L'empreinte couvre acteur/session, workspace, mission, run,
   intention/payload hash, agent moteur, rôle/version/état et références exactes.
5. La preuve de l'adaptateur doit couvrir cette empreinte exacte et avoir une
   validité d'au plus 15 secondes. Une résolution de plus de 15 secondes, un JWT
   expiré ou une régression d'horloge sont refusés à la fin du contrôle. Ce délai
   est une règle de fraîcheur, pas une annulation des appels bloqués : les futurs
   adaptateurs devront aussi imposer leurs délais réseau/SQL.

La projection retournée est gelée et exclut session, acteur et identifiant moteur.
Elle conserve les références et leur provenance de sélection, mais aucun contenu,
URL ou secret. `canDispatch:false`, `canEnqueue:false` et
`requiresRevalidationBeforeExecution:true` sont systématiques. Ce résultat ne doit
pas être réutilisé comme un ticket d'autorisation ; toute future exécution exige
les contrôles transactionnels d'approbation/outbox et une nouvelle validation.

## Références de ressources

Au maximum 12 références : fournisseur GitHub ou Notion, connexion UUID,
identifiant opaque local, version exacte et opération de lecture. Les seules
opérations de ce contrat sont `pull_requests.read`, `pull_requests.files.read`
et `pages.read` selon leur fournisseur. Aucune URL, chemin ou donnée fournisseur
brute n'est accepté. L'identifiant opaque doit être résolu côté serveur vers les
ResourceRef propres au connecteur ; ce n'est pas un nouveau format fournisseur.
Les adaptations vers les contrats GitHub/Notion existants restent à brancher.

Doublons de même connexion/ressource/opération, versions vides, champs cachés et
opérations d'écriture sont refusés. L'empreinte change avec la version, connexion,
identifiant ou opération. Les textes externes restent non fiables et ne deviennent
jamais des instructions ou des droits par l'effet du resolver.

## SQL privé et fraîcheur

`query` doit être un lecteur serveur privé dédié, utilisant des statements frais
en autocommit ou READ COMMITTED. La requête refuse tout autre niveau d'isolation :
deux lectures dans REPEATABLE READ pourraient conserver un instantané antérieur
à une révocation. Aucun verrou n'est conservé pendant une lecture fournisseur.
La double lecture détecte les changements observables ; elle ne supprime pas la
course après la dernière lecture ni un changement suivi d'un retour à la même
valeur. Ce module est donc une prévalidation, pas une barrière d'exécution atomique.

La proposition d'affectation est exécutée uniquement par la CI jetable. Aucun SQL,
grant ou endpoint d'écriture n'est appliqué à Supabase. Aucun rôle de production,
grant ou fonction definer n'est ajouté. Les clients
anon/authenticated n'obtiennent aucun accès aux liaisons privées. L'identité du
lecteur et ses privilèges minimaux (dont accès contrôlé à Auth) restent à livrer
et vérifier avant câblage. Aucun Data API `private` ni service key navigateur.

## Vérification et suite

Tests Node : injection d'identité/droits, ressources/version/empreinte, scope
croisé, cache/révocation, JWT/horloge, métadonnées expurgées, erreurs privées.
Le test `tests/engine-context-postgres.mjs` exerce le SELECT réel et une seconde
connexion qui commit une révocation pendant l'adaptateur simulé : session
supprimée/expirée/réaffectée, rôle retiré, mission clôturée, instance suspendue,
liaison runtime nulle/remplacée, affectation mission-agent révoquée, grant de
primitive révoqué et version changée. La suite SQL proposal vérifie audit,
isolation tenant, immutabilité et deny-by-default. Elle vérifie aussi le refus d'un
instantané REPEATABLE READ, zéro outbox/audit et run toujours draft.

Ces tests utilisent PG17 jetable et un faux adaptateur fournisseur, pas Supabase
Auth ni GitHub/Notion/MAUSBOT réels. La CI reprend l'arbre assemblé PR54 et ses
tests existants. Aucun schéma Supabase ou déploiement Web n'est modifié.

Restent : revue/promotion/application éventuelles de la proposition et chemin
d'écriture session-admin/audit, adaptateurs de ressources réels, identité SQL
privée, intégration BFF/worker sous gates,
canaux/groupes, staging et vraie Auth/UI, puis SHA133 avant connexion SHA105.

### Durcissement de la proposition d'affectation — 25 octobre 2026

La proposition ajoute maintenant des index complets pour les clés étrangères des
affectations et grants (y compris les lignes révoquées), rejette les inserts déjà
révoqués afin que chaque ligne passe par l'événement d'ajout puis une révocation
auditée, et supprime l'index partiel non-unique qui dupliquait l'index unique des
grants actifs. Les tests PG jetables vérifient ces refus et la présence des index.
Ce SQL reste une proposition non appliquée; aucun writer ni route d'affectation
n'est livré et MAUSBOT reste verrouillé.
KMS toujours différé selon la décision Founder.

Références consultées : [sessions Supabase](https://supabase.com/docs/guides/auth/sessions)
et [isolation PostgreSQL17](https://www.postgresql.org/docs/17/transaction-iso.html).
