# ATLAS Engine Hub — audit du 24 octobre 2026, architecture et lot v0

## Etat reel du produit

ATLAS HQ est un Next.js 16 App Router/PWA; les routes applicatives sous src/app
utilisent Supabase Auth SSR. Les workspaces et workspace_members controlent
l'appartenance avec RLS. atlas_missions et atlas_mission_reviews gerent de vraies
missions et decisions; la base a aussi des tables GitHub/Linear. Au début de cet audit, aucune table de registre moteur ou relation
mission↔job n'existait ; elles ont depuis été créées et protégées par les migrations
Supabase Engines du 24/10/2026 (voir section persistance). Agents & Equipes n'avait qu'un etat vide, Chief avait un
assistant guide sans LLM autonome. Mes Apps est un espace d'outils connectes,
pas un espace de moteurs IA.

## Taxonomie non negociable

- **Apps** = outils et donnees (GitHub, Linear, Drive, etc.).
- **Moteurs** = runtimes d'execution (MAUSBOT, futur Hermes, etc.).
- **Agents & Equipes** = identites et organisations logiques, avec bindings
  vers les agents reels de chaque moteur.
- **Missions** = objectifs metier ATLAS, distincts d'un job/turn interne moteur.
- **Chief** = orchestrateur ATLAS avec politique d'approbation, pas un substitut
  au runtime du moteur.

Flux cible : UI ATLAS → BFF securise → registre moteur/capabilities →
adaptateur MAUSBOT (HTTP pour commandes, SSE/jobs pour etat, MCP/CLI pour
integrations) → runtime MAUSBOT; flux inverse : tools MCP et evenements.
Il ne faut pas appeler plusieurs transports pour effectuer la meme mutation.

## Lot v0 du present changement

Ajoute /engines, sa navigation, les contrats du registre, un adaptateur HTTP
MAUSBOT cote serveur, et trois endpoints authentifies :

- GET /api/engines?workspaceId=<uuid> — catalogue et configuration du workspace.
- GET /api/engines/mausbot?workspaceId=<uuid>&view=health|agents|job
  (job demande threadId) — lecture live du moteur.
- POST /api/engines/mausbot/dispatch avec
  {workspaceId,botId,title,instruction} — proprietaire/admin uniquement.

La creation suit : verification de l'agent existant, POST /api/bots/:id/tasks
en mode approvalMode=ask, puis POST /api/bots/:id/messages avec sendId unique.
La reponse 202 prouve seulement l'acceptation du message, pas la fin de
l'execution. En cas d'echec du deuxieme appel, le threadId cree est retourne
pour eviter une relance aveugle qui dupliquerait les taches.

Configuration du v0, strictement dans les secrets ENV **serveur**:
ATLAS_MAUSBOT_URL (HTTPS externe ou loopback local),
ATLAS_MAUSBOT_TOKEN (token de session pairée du serveur MAUSBOT),
ATLAS_MAUSBOT_WORKSPACE_ID (UUID ATLAS autorise).
Le moteur n'est jamais selectable par URL navigateur. Un workspace n'accede
jamais a une instance qui appartient a un autre workspace. Aucune connexion
ou capacite Hermes n'est simulee. Par defaut aucun moteur n'est configure.

ATTENTION : le runtime Atlas heberge sur Vercel doit pouvoir joindre MAUSBOT.
127.0.0.1 dans Vercel n'est pas le poste personnel. Une instance dediee
exposee sur HTTPS avec appairage correct est necessaire. Ne jamais exposer un
serveur MAUSBOT sans authentification ni attribuer l'acces Full automatiquement.

## Supabase Engines — six migrations déjà appliquées (24/10/2026)

- 20261024161305_atlas_engine_foundation_preconnection : 9 tables RLS
  (2 tables publiques de métadonnées : instances et runs ; 7 tables privées :
  bindings d'agents, clés chiffrées, approbations, outbox, curseurs SSE,
  reçus d'événements et audit).
- 20261024163943_atlas_engine_outbox_envelope_v1 : colonnes NOT NULL key_id,
  version pour identifier chaque clé utilisée par l'outbox chiffrée.
- 20261024182928_atlas_engine_approval_intent_v1 : empreinte payload SHA-256
  sur le run et empreinte d'intention sur la demande, toutes deux immuables.
- 20261024193128_atlas_engine_pending_approvals_readonly : lecture
  owner/admin validée par session Supabase active en base.
- 20261024193537_atlas_engine_approval_inbox_definer_hardening :
  RPC publique SECURITY INVOKER ; logique privilégiée privée.
- 20261024200020_atlas_engine_approval_decision_atomic_v1 :
  décision transactionnelle avec audit, vérification de session actuelle,
  sans envoi au moteur (canDispatch false).

Après contrôle : 0 moteur MAUSBOT, 0 run, 0 approbation et 0 message
outbox en base. Une primitive AES-256-GCM testée localement existe mais
n'est pas reliée à un KMS ou au pilote privé de la base. Les lectures
natives sont mock-testées ; toutes les écritures et exécutions MAUSBOT
sont bloquées (HTTP 423). L'API /api/engines/instances n'autorise que
l'inscription offline par owner/admin.

Il faut distinguer 1) SQL appliqué, 2) code sur main, 3) site Web
déployé, 4) runtime MAUSBOT réellement connecté. Ce sont quatre états
différents. Voir docs/operations/atlas-engine-m0-main-release-2026-10-24.md.

## Etapes suivantes

- P0 : executer npm test, npm run typecheck, npm run lint, npm run build,
  et confirmer les permissions de session sur installation MAUSBOT reelle.
- P1 : SQL du socle appliqué ; poursuivre coffre KMS réel, DB privée,
  approbations humaines, worker outbox + fencing, essais RLS Auth et reprises.
- P1 : relier Agents & Equipes a atlas_engine_agents, Missions aux runs
  et Inbox aux demandes d'approbation, avec reconciliation du job tree.
- P2 : SSE Last-Event-ID, files de traitement, retries bornes, webhooks,
  pieces jointes et reprises apres coupure.
- P2 : pont MCP sortant pour outils metier ATLAS, adaptateur CLI de
  provisioning idempotent, catalogues de skills/outils par moteur.
- P3 : Chief choisit un agent/moteur via capacites/politiques,
  propose une action et demande validation avant mutation.
- P3 : Hermes ou autres moteurs ajoutent leurs adaptateurs, sans changer
  les contrats ATLAS Agents, Missions et Chief.

Ne pas confondre GitHub commit, Vercel preview et Vercel production :
suivre AGENTS.md et docs/operations/worker-handoff-2026-10-24.md.

## Blocage technique préconnexion par défaut

`packages/engine-core/src/release-gates.mjs` impose une sécurité supplémentaire :
URL+token configurés ne suffisent pas. `ATLAS_MAUSBOT_RELEASE_STAGE` vaut
`offline` par défaut (si absent, mal orthographié ou explicitement offline).
Les requêtes live (health, agents, job) exigent `read-only` ou `enabled`.
Les mutations `write` et `execute` sont **bloquées matériellement**
en préconnexion (423 `MAUSBOT_DURABLE_APPROVAL_REQUIRED`) même si
`ATLAS_MAUSBOT_RELEASE_STAGE=enabled` et l'ancien drapeau
`ATLAS_MAUSBOT_MUTATIONS_ACK` sont présents. La présence d'un jeton
MAUSBOT ou d'un booléen d'environnement ne peut pas suppléer
l'approbation humaine et l'audit durables.
L'interface garde les capacités offline visibles avec statut `preconnection`.
Ces flags **ne constituent pas une autorisation suffisante pour la production** :
les gates humains, registre multi-instance et audit durable doivent être
réellement développés avant le changement d'environnement.
