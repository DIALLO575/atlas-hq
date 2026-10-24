# MAUSBOT → ATLAS : contrat des primitives avant connexion

Date de contrôle : 24 octobre 2026.
Source : [scripts/mcp-server.ts](https://github.com/milind-soni/OpenMausBot/blob/main/scripts/mcp-server.ts),
[docs/mcp-server.md](https://github.com/milind-soni/OpenMausBot/blob/main/docs/mcp-server.md).
Ne pas inférer des capacités absentes ni considérer les tests simulés comme des tests live.

## Priorité : compiler les capacités avant de raccorder un runtime

Une primitive ATLAS est un acte métier stable avec :
- **id ATLAS** (pas de dépendance UI/provider),
- **tool MCP origine**,
- **mode** read, write ou execute,
- **transport vérifié dans la source** (HTTP pour les 20 outils du MCP),
- **schéma d'arguments strict** (champs inconnus refusés),
- **projection de sortie limitée** (pas de screenshot en base64 ni de secrets),
- **validation des droits en amont** (workspace Supabase, owner/admin pour écrire/lancer),
- **drapeau hostTested=false** tant que l'intégration live ne passe pas.

20 primitives opérationnelles en source-mapping HTTP :
1. system.health ← get_system_health
2. agents.list ← list_bots
3. conversations.messages.list ← get_bot_messages
4. conversations.messages.send ← send_bot_message
5. agents.create ← create_bot
6. agents.update ← update_bot_profile
7. channels.list ← list_channels
8. channels.messages.list ← get_channel_messages
9. channels.messages.send ← send_channel_message
10. channels.create ← create_channel
11. channels.update ← update_channel
12. tasks.create ← create_task
13. tasks.activate ← switch_task
14. tasks.rename ← rename_task
15. search.messages ← search_messages
16. jobs.wait ← wait_for_conversation (adapter HTTP : UNE observation bornée à 24 s, non équivalente à attente MCP complète 120 s)
17. models.set ← set_bot_model
18. conversations.messages.edit ← edit_bot_message
19. models.list ← list_available_models
20. jobs.interrupt ← interrupt_conversation

Manifest : packages/engine-core/src/primitives.mjs
Exécution : packages/engines/mausbot/src/primitives.mjs
Endpoint admin/read : GET/POST /api/engines/mausbot/primitives.
Le GET affiche les contrats sans token ni instance active. POST valide l'auth
et ne publie aucune URL brute de harness vers le client.

### Transports futurs et surfaces restreintes

MCP stdio, CLI, SSE, webhooks, routines, skills, outils MCP entrants et
companion nécessitent des adaptateurs séparés, avec des transports possédant
leurs propres garanties. Le registre déclare ces surfaces prévues sans
prétendre qu'elles sont déjà implémentées. Approvals, secrets, computer restent
RESTRICTED : jamais de contournement du parcours humain.

### Points sensibles AVANT activation de tous les writes en production

- Introduire en base les instances distinctes par tenant, le secret vault et
  les bindings workspace → moteur → agent → mission.
- Ajouter une outbox transactionnelle avec idempotency_key et rejouer les
  messages avec le MEME send_id après crash. create bot/channel/task n'étant
  pas idempotent, ne jamais le réessayer automatiquement.
- Vérifier les liens d'appartenance sur chaque task/thread avant tout write.
- Mettre quotas et audit sur les primitives « execute ».
- Établir la sémantique des états jobs sur versions de runtime réellement
  utilisées : état settled peut coexister avec state failed.
- SSE nécessite reconnexion Last-Event-ID et revalidation ACL après reprise.
- La fonction Vercel ne doit pas exécuter de process CLI/mcp stdio persistant :
  installer un worker durable séparé pour ces transports.
- Aucun secret moteur dans Next public env ; PAS de self-host loopback owner
  partagé entre locataires.

### Preuve attendue

La suite tests/mausbot-primitives.test.mjs vérifie le routage et les méthodes
des 20 outils avec un fetch simulé. Les tests ne se connectent pas à MAUSBOT
et ne confirment pas une version de serveur déployée. Les états visibles dans
l'interface doivent rester "non connecté" jusqu'à vérification live.

Séquence :
contrats validés → mappings HTTP testés → isolation multi-tenant et journal
d'actions Supabase → worker MCP+CLI+SSE → test de MAUSBOT isolé → premier
raccordement privé → extension progressive vers Hermes.

## Contrats de transport préparés sans connexion (lot suivant)

\`packages/engines/mausbot/src/protocols.mjs\` fournit trois primitives *hors réseau* :
- \`planMausbotMcpCall\` valide l'action ATLAS, émet un message JSON-RPC 2.0
  \`tools/call\` vers le nom officiel MCP; n'ouvre aucun stdio lui-même.
- \`parseMausbotSseBlock\` interprète une frame complète SSE et le curseur
  / \`resumed\`; le message est projeté sans captures d'écran ni secret. Pas
  encore de consommation en continu, reprise ni stockage cursor SQL.
- \`planMausbotCli\` produit un \`argv\` shell-free pour un **worker durable** :
  doctor, engine list, team apply --dry-run / --check et apply seulement si
  un appelant lui fournit un accord explicite. L'accord doit encore être
  relié à une validation humaine persistée côté ATLAS.

Ces contrats ne constituent PAS une connexion MCP, SSE ou CLI opérationnelle.

## Audit extensif source → 128 capacités natives (ATLAS M0)

Source gelée : `milind-soni/OpenMausBot@0a78caa91a64c1ab1adfa972ab4e540e89b66c6d`.

Le catalogue `packages/engine-core/src/native-capabilities.mjs` comporte **128
entrées natives** réparties entre : agents/profils, mémoire, skills, MCP bots,
équipes, channels, fichiers, webhooks, routines, observabilité, ordinateurs,
connecteurs et live. Chaque entrée garde la méthode/route ou la preuve
d'exemple, le niveau de permission, la provenance et le statut.

**Ce sont 128 capacités SOURCE-MAPPÉES, pas 128 opérations exécutables !**
`callable=false`, `hostTested=false` et `secretPolicy=deny-raw-results`
pour toutes les entrées. L'état `implementation` distingue `contract-only`,
`adapter-mock-tested` et `validated-plan` ; aucun de ces états n'autorise un appel live.
La surface MCP initiale de 20 opérations est suivie séparément et a des
mappings HTTP mock-testés ; les primitives natives ne sont jamais transmises
par le POST d'ATLAS. Les fonctions d'approbation auto, credential, shell,
ordinateur, endpoints internes tournent en mode `restricted` ou `human`.

Contrat complémentaire `planNativePrimitive` : interpolations de paramètres
d'ID strictement allowlistées, aucun appel réseau ni corps arbitraire.
Une entrée provenant d'un script de vérification ou de l'UI est identifiée
comme telle, moins forte qu'une preuve server-route.

### Source de vérité et gates de Linear

Projet [ATLAS HQ V0](https://linear.app/shadoron/project/atlas-hq-v0-fonctionnelle-a3866a7ccc6b).
Parent [SHA-104](https://linear.app/shadoron/issue/SHA-104) ;
jalon M0 « Toutes les primitives avant connexion » ;
SHA-126…SHA-133 couvrent le catalogue complet et ses contraintes.
[SHA-105](https://linear.app/shadoron/issue/SHA-105) reste Backlog jusqu'aux
preuves contractuelles et permissions de M0.

Ce catalogue ne doit pas être considéré comme une garantie de complétude
historique ou une surface publique stable. Les versions futures de MAUSBOT
pourraient déplacer, ajouter ou supprimer des routes ; un diff source
automatisé et la comparaison de la version live seront obligatoires.

## Lot M0.2 — 11 adaptateurs de lecture + 11 plans de mutation

`packages/engines/mausbot/src/native-read.mjs` :
11 opérations GET strictement allowlistées (mémoires, journal et upkeep,
skills et bibliothèque, contexte et team memory). Chaque opération vérifie
les IDs, les paramètres, l'existence du bot dans l'inventaire autorisé,
les limites et projette uniquement des **métadonnées**. Les contenus
SKILL.md, mémoire, diffs et chemins de travail restent occultés. Le
module est testable avec fetch mock, mais **non exposé via le BFF public**.

`packages/engines/mausbot/src/native-mutation-plans.mjs` :
11 plans sans réseau (écritures et suppression mémoire, validation humaine
de mémoire, rangement, activation/attribution skills, contexte d'équipe).
Chaque plan exige une approbation réelle et une piste d'audit persistante,
puis impose un retry prudent. Les simples booléens d'approbation fournis
par un navigateur sont rejetés. Aucune mutation n'est effectuée par le plan.

Sur **128 capacités natives répertoriées** :
- 11 adaptateurs de lectures de métadonnées mock-testés, pas live;
- 11 plans de mutations validés offline, non exécutables;
- 106 autres contrats cartographiés, à approfondir.
Toutes les 128 capacités restent `callable=false` et `hostTested=false`.

## Lot M0.3 — Équipes, canaux et CLI : 2 lectures + 7 plans offline

Source officielle vérifiée :
`server/routes/teams.ts`, `server/routes/channels.ts`,
`server/routes/bulk-delete.ts`, `server/team-library.ts`,
`server/org-library.ts`, `docs/headless-cli.md`.

`packages/engines/mausbot/src/team-channel-contracts.mjs` ajoute :
- lectures structurées de `/api/team-library/catalog` et
  `/api/org-library`, avec projections de métadonnées sans manifests,
  textes privés, identifiants secrets ou payloads de package ;
- 7 plans de mutations : `teams.export` (manifest seul, ni package ni
  backup avec transcripts), `teams.organization.install`,
  `channels.mark-read`, `channels.queue.cancel`,
  `channels.queue.steer`, `channels.members.compact`,
  `channels.tasks.delete` (1-500 threadIds distincts) ;
- inspection CLI `team apply --dry-run` ou `--check` uniquement,
  en passant une liste d'arguments sans shell et des chemins
  pré-provisionnés dans un worker externe.

Les 7 plans refusent les clés étrangères, fausses autorisations, path
traversal, commandes destructives implicites et répétitions automatiques.
Ils ne sont **pas exécutables** : la vérification de propriété des canaux,
du nombre de tâches à conserver, des opérations de file d'attente et des
approbations doit se refaire côté moteur au moment de l'exécution.

Bilan **128 capacités natives cataloguées** :
**13 lectures avec adaptateur simulé**, **18 plans de mutations offline**,
**97 entrées encore cartographiées sans adaptateur**, **0 connectée**.
Toujours **20 primitives MCP** à part. L'ajout d'une famille ne constitue
pas une garantie d'exhaustivité de l'API MAUSBOT.

### Ajout validé : plan d'import strict OpenMaus Team v2

`teams.import` est désormais planifié **hors connexion seulement** : format
`openmaus.team`, version **2**, jusqu'à 50 membres, champs du manifeste
strictement allowlistés, noms et couleurs valides, 24 Ko d'instructions
permanentes par agent et payload total limité à 64 Ko. Le plan impose
`?mode=add`, sans `replace`, `cwd`, secrets, `approvalMode`, outil ou
ordinateur arbitraire. Seuls les paramètres sûrs du manifeste sont conservés ;
la vérification finale et l'autorisation humaine sont à faire dans le worker.

Bilan courant : **13 lectures natives mock-testées**, **19 plans natifs de
mutations validés offline**, **96 contrats natifs encore sans adaptateur**,
0 live, total stable **128**. Aucune connexion réelle.

## M0.4 — MCP entrants, connecteurs et OAuth : 4 lectures + 10 plans offline

Références source : server/routes/mcp-servers.ts, server/routes/team-connections.ts,
server/team-connections.ts, server/mcp-registry.ts, docs/custom-mcp-servers.md,
docs/composio.md. Les deux catalogues connecteurs sont aussi documentés
dans les tests et la surface Companion ; aucune stabilité versionnée garantie.

Le fichier packages/engines/mausbot/src/mcp-connectors.mjs distingue
**3 couches MCP distinctes** :
- external-control : openmausbot mcp (stdio pour clients externes) ;
- agent-tools : serveurs MCP distants ou stdio, configurés comme outils des agents ;
- internal-bridge : protocole par-tour du moteur, **interdit comme API publique**.

Les **4 lectures de métadonnées** (testées avec fetch simulé) :
- mcp.bot-servers.list : noms, type, enabled, état d'authentification. Exclut
  adresses, commandes, arguments, noms d'environnement, en-têtes, OAuth clientId ;
- mcp.team.connections : noms des outils connectés et compteurs. Exclut
  email, host, IDs/alias de comptes et secrets ;
- connectors.catalog : uniquement slug et label des outils ;
- connectors.connected : états et nombre de comptes sans leurs identifiants.

Les **10 plans de mutation sans réseau**, jamais appelables :
MCP test, activation, début/fin d'authentification, annulation de flow,
scopes connexion team/person, sign-in/disconnect MCP par personne,
connect/disconnect Apps par personne. Ils refusent systématiquement les
URLs arbitraires, clés brutes, callback URLs, champs d'approbation navigateur
et configuration d'un serveur programmable. L'authentification doit être
réalisée par une **session humaine** avec OAuth/PKCE de MAUSBOT, et jamais
par une requête d'agent ou un token de service générique. Tests mock couvrent
le refus de ces appels.

À chaque éventuelle activation future : liaison workspace + utilisateur
réel, sessions révoquées, autorisation admin/person, registre des serveurs
approuvés, protocole OAuth, protections SSRF pour URL distantes, scope par
compte, journal d'audit durable, vérifications d'ownership côté moteur.

**Bilan à présent : 128 native cataloguées, 17 lectures avec adaptateur
mock-testé, 29 plans de mutations validés offline, 82 source-only.
20 primitives MCP externes testées en simulation, 0 connexion MAUSBOT réelle.**


## M0.5 — SSE, jobs, automatisations et webhooks (hors connexion)

Sources vérifiées dans OpenMausBot : server/routes/webhooks.ts,
server/webhooks.ts, server/routes/jobs.ts, server/job-view.ts,
server/routes/notifications.ts, shared/notification.ts,
scripts/verify-routines.ts et docs/verification/routines.md.

Le module packages/engines/mausbot/src/event-automation.mjs comprend :
- 4 lectures de métadonnées mock-testées : webhooks.list,
  routines.list, notifications.list, jobs.snapshot. Les textes de
  notifications, instructions de routine, secrets/adresses de webhooks,
  questions, réponses et résultats de job NE sont PAS retournés.
- Jobs : paramètres threadId/since/version/wait bornés, scope=job
  uniquement ; 25 000 ms est la limite source des attentes longues,
  mais aucune attente ni worker live n'est mis en place.
  Les états needs-input, failed et stalled ne sont jamais transformés
  en succès. Un travail completed avec erreurs enfants n'est pas certifié
  comme succès business. Les compteurs viennent du fournisseur.
- 8 plans de mutation offline : webhooks.test (événement de vérification
  prédéfini), webhooks.rotate, webhooks.update (enabled), webhooks.delete,
  routines.update (enabled), routines.run, notifications.read et
  notifications.read-all. Aucune création arbitraire ni rotation exécutée.
- SSE : plan de reprise /api/events avec Last-Event-ID borné ;
  réconciliation de curseur et rejet d'un replay manqué / duplicate
  simulés. Une simple égalité de curseur ne suffit PAS pour
  l'idempotence durable ; la prochaine étape doit inclure stockage,
  reprise, version et contrôle de session. Aucun ticket de stream
  n'est demandé avant la connexion.

Sécurité avant activation : liaison d'un thread/job à une mission et son
workspace; vérification de droits sur chaque lecture, redemande des scopes
après long-poll, coffre pour les secrets de webhook, déclencheurs signés,
déduplication des livraisons et coûts/rate-limits, approbations humaines.

Totaux M0 : 128 capacités natives source-mappées, **21 lectures avec
adaptateurs mock-testés**, **37 plans de mutations validés offline**,
**70 capacités encore source-only**, 0 opérations natives autorisées live.
Les 20 outils MCP officiels restent distincts.

## M0.6 — Fichiers, navigateur, ordinateurs et Companion (offline)

Sources : OpenMausBot server/routes/threads.ts, computers.ts,
browser-sites.ts, computer-usage.ts, computer-frames.ts,
server/attachments.ts et docs/desktop-companion.md.

Le nouveau module packages/engines/mausbot/src/file-computer-contracts.mjs
contient trois groupes de primitives :
- 3 lectures de MÉTADONNÉES simulées : computer.usage, computer.local.status,
  browser.sites. Les résultats suppriment sites consultés, cookies, mots de
  passe, URLs de viewer et commandes. Aucune API BFF ne les expose.
- 5 plans de mutations hors réseau : browser.sign-out sur UN site nommé,
  computer.local.run/start/stop/remove. Revue humaine, contrôle de propriété,
  approbation de coût et confirmation destructive doivent être prouvés
  dans un journal durable avant toute exécution.
- 5 plans de TRANSFERT BINAIRE (sans flux réseau) : export de conversation
  en Markdown, récupération d'image de message, aperçu d'une image issue
  d'une référence de message, upload image et upload fichier avec UUID.
  Les limites natives MAUSBOT sont 10 MiB (image) et 25 MiB (fichier).
  Les MIME / extensions autorisés, le nom et l'uploadId sont contrôlés.
  L'endpoint général POST de lecture de fichier avec chemin libre est exclu ;
  seul le mode preview=1&ref=N validé est préparé.

La surface Companion garde une identité d'appareil distincte, une allowlist
et les droits viewer explicites. Ne jamais y proxifier l'API host entière
ni exposer un viewer, une capture, un cookie, un mot de passe ou un tunnel.

Ces plans ne font aucune action réelle : pas de téléchargement, d'upload,
de capture, de commande ou de lecture de navigateur, pas de serveur raccordé.
Un worker de streaming borné et un contrôle de droits sur chaque
workspace/thread/message restent à implémenter avant activation.

Bilan M0 : 128 natives = 24 lectures metadata mock-testées + 42 plans
de mutation offline + 5 plans binaires + 57 autres capacités source-only.
Le nombre de primitives natives autorisées ou testées sur MAUSBOT réel
reste exactement zéro.


## M0.7 — proposition de persistance Supabase (SHA-132)

Voir `docs/architecture/engine-persistence.md`,
`supabase/migrations/20261024161305_atlas_engine_foundation_preconnection.sql` et
`tests/sql/engine-foundation-*.sql`.

Les tables proposées relient obligatoirement workspace, instance,
mission, demandeur et agent logique ; séparent les statuts affichables
en RLS des clés, de l'outbox chiffrée, des approbations et des journaux
privés. L'outbox ne peut passer en `leased` sans approbation humaine
explicite, non expirée, run autorisé et instance connectée.

Les nouvelles fonctions `planEngineRegistration` et
`planEngineRunDraft` dans `packages/engine-core/src/persistence-contracts.mjs`
rejettent URLs, tokens, instructions brutes, faux droits, autres
workspaces et primitives natives non opérationnelles. Ces plans
restent toujours `callable=false` et `canEnqueue=false`.

Tests PostgreSQL sur base jetable en CI + tests Node hors réseau.
**Migration `20261024161305` appliquée au projet Supabase ATLAS connecté : 9 tables
créées, RLS active, 0 instance/mission de moteur.** Il reste à développer
le vault, l'actor-session proof, les transactions du worker, les
leases à jeton de fencing, RLS Supabase complète et l'E2E sandbox.
