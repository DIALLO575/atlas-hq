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

## Audit extensif source → 119 primitives natives (ATLAS M0)

Source gelée : `milind-soni/OpenMausBot@0a78caa91a64c1ab1adfa972ab4e540e89b66c6d`.

Le catalogue `packages/engine-core/src/native-capabilities.mjs` comporte **128
entrées natives** réparties entre : agents/profils, mémoire, skills, MCP bots,
équipes, channels, fichiers, webhooks, routines, observabilité, ordinateurs,
connecteurs et live. Chaque entrée garde la méthode/route ou la preuve
d'exemple, le niveau de permission, la provenance et le statut.

**Ce sont 119 contrats SOURCE-MAPPÉS, pas 119 opérations exécutables !**
`callable=false`, `hostTested=false`, `implementation=contract-only`
et `secretPolicy=deny-raw-results` pour toutes les entrées.
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
