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
