# ATLAS HQ — M0 Moteurs : bilan de livraison du 24 octobre 2026

**Livraison vérifiée :** PR GitHub #33 fusionnée dans main au commit
ab21fcfbfeb6ef75bc6147cd80b7137ae22be301.
CI du commit fusionné VERTE : https://github.com/DIALLO575/atlas-hq/actions/runs/40114818208
(validate, engine-foundation-postgres, linear-oauth-postgres,
notion-foundation-postgres). La fusion n'implique ni déploiement
Vercel/Netlify ni activation MAUSBOT.

## Réalisé et vérifié

| Domaine | Réalisation | Limite exacte |
| --- | --- | --- |
| 20 outils MCP officiels | Contrats, mappings HTTP et tests simulés | Aucun hôte MAUSBOT réel validé |
| 128 capacités natives | 24 lectures mock-testées, 42 plans de mutation offline, 5 plans binaires, 57 définitions source-only | Aucune des 128 capacités n'est disponible live; MCP et HTTP peuvent se recouper |
| Transports MCP/CLI/SSE | Contrats et tests offline | Ni worker réel, ni reprise transactionnelle |
| Interface Espace Moteurs | Catalogue et écran de préconnexion | Aucun moteur relié |
| API instances | GET métadonnées, POST réservé owner/admin, création uniquement offline | Disponibilité Web dépend du déploiement |
| Chiffrement | AES-256-GCM/HKDF-SHA256, clés versionnées, contexte tenant/instance, rotation mock-testée | Pas de vrai KMS ni de pilote d'accès private |
| Persistance | Cinq migrations réelles dans Supabase ATLAS, neuf tables Engines avec RLS | Aucune exécution réelle ni secret opérationnel |
| Mutations moteur | Blocage HTTP 423 même avec anciens drapeaux env | Déverrouillage interdit avant vérification et approbations durables |

### Les cinq migrations Supabase déjà appliquées

- 20261024161305_atlas_engine_foundation_preconnection : 9 tables
  dont 2 dans public (instances, runs) et 7 dans private.
- 20261024163943_atlas_engine_outbox_envelope_v1 :
  key_id et version NOT NULL sur la file chiffrée.
- 20261024182928_atlas_engine_approval_intent_v1 : SHA-256 obligatoire
  sur les runs et approbations ; deux triggers empêchent de modifier
  la mission/primitive/payload ou de remplacer une empreinte approuvée.
- 20261024193128_atlas_engine_pending_approvals_readonly : Inbox SQL
  consultative avec session active, rôle workspace actuel et anti-self-review.
- 20261024193537_atlas_engine_approval_inbox_definer_hardening :
  la RPC publique devient SECURITY INVOKER, sa logique privilégiée privée.

Les SQL versionnés figurent dans supabase/migrations/.
Ne PAS les rejouer : versions présentes dans l'historique Supabase.

La dernière vérification de base a confirmé **9 tables**, **0 instance
moteur**, **0 run**, **0 approbation** et **0 élément outbox**. Les sept
tables privées sont RLS actives, sans droit SELECT pour anon/authenticated.
Le signalement Supabase « RLS enabled no policy » sur ces tables privées
est intentionnel (accès interdit aux clients). La protection contre les
mots de passe compromis (avis Auth) est un point distinct à traiter.

### Contrôles effectivement réussis

- GitHub Actions avant fusion : tests Node, TypeScript, ESLint, build,
  audit dépendances, scan secrets, PostgreSQL 17 jetable
  (RLS deux tenants, approbations, outbox, clé idempotente, audit).
- Un test simulé n'est PAS une validation contre une instance MAUSBOT,
  ni une validation de session authentifiée Supabase de bout en bout.
- Aucune mutation, credential ou tâche MAUSBOT enregistrée ou exécutée.
- Les modifications Notion et autres contributions déjà sur main
  doivent être conservées lors de la fusion.

## Ce qu'il reste réellement

1. **SHA-132** : intégrer le coffre AES-GCM à un KMS et à un pilote de
   base privée ; gestion de rotation, révocation et autorisations d'accès.
2. **SHA-132** : créer et prouver les validations humaines pour chaque
   action (vraie session, acteur différent, scopes, expiration).
3. **SHA-132** : développer un worker transactionnel outbox qui revendique
   les tâches sous lease/fencing, déduplique, réessaie de manière bornée,
   reprend sur incident, conserve un audit et les curseurs SSE.
4. **SHA-126 à SHA-131** : auditer et prioriser les 57 capacités natives
   encore source-only, tester les protocoles sur l'API hôte compatible et
   réserver les capacités destructrices aux opérateurs.
5. **SHA-133** : tests d'intégration Supabase Auth/RLS live avec comptes de
   test, tests de concurrence/panne, revue sécurité et sandbox MAUSBOT.
6. **SHA-105** : uniquement APRES ces verrous, permettre la connexion
   MAUSBOT read-only puis l'exécution approuvée, et l'E2E mission->run.

## Contrat de produit

**Apps** = intégrations/données métier.
**Engines** = runtime providers (MAUSBOT en premier, Hermes plus tard).
**Agents/Teams** = identités; **Missions** = tâches; **Chief** = orchestration.

Aucune URL, clé KMS, clé service_role ou token ne doit passer dans
NEXT_PUBLIC_, browser, localStorage ou les logs. Le schéma private
ne doit PAS être exposé au Data API. Pas de contrôle VM, shell ou
webhook signé sans scope vérifié et autorisation humaine durable.

## Références et critères de diffusion

- Code : https://github.com/DIALLO575/atlas-hq
- PR : https://github.com/DIALLO575/atlas-hq/pull/33
- Suivi Linear : https://linear.app/shadoron/issue/SHA-104 et
  https://linear.app/shadoron/issue/SHA-132 ;
  certification : https://linear.app/shadoron/issue/SHA-133
- CI du commit de fusion main vérifiée verte (lien plus haut). Les commits
  de documentation ultérieurs doivent avoir leur propre CI vérifiée.
- Main, Vercel/Netlify, Supabase SQL et moteur MAUSBOT sont QUATRE
  états indépendants. Ne pas annoncer un déploiement sans preuve d'hôte.


## États de suivi Linear au moment de la fusion

- SHA-104 : In Progress — contrat engines, processus parent.
- SHA-126 à SHA-132 : In Progress — prototypes, catalogues, sécurité
  et persistance livrés partiellement, mais aucune connectivité live.
- SHA-133 : Todo — certification et revue GO/NO-GO.
- SHA-105 : Backlog — connexion réelle d'OpenMausBot, toujours bloquée.

Ce sont des statuts de chantier, pas des erreurs de livraison GitHub.
Le socle SQL et le code de préconnexion peuvent être sur main alors que
l'exécution réelle reste strictement interdite.


## Avancement SHA-150 — 24 octobre 2026

La troisième migration est appliquée et confirmée en Supabase :
`public.atlas_engine_runs.payload_sha256` et
`private.atlas_engine_approvals.intent_digest` sont NOT NULL.
Deux nouveaux triggers protègent l'intégrité. La CI du SQL jetable
valide la cohérence SHA-256 avec Node, les modifications interdites,
les permissions et les migrations précédentes. 0 instance/run/approval.

Le code `packages/engine-core/src/approval-workflow.mjs` vérifie
la session via callback transactionnel, rôle actuel, reviewer indépendant,
intention exacte et expiration ; les mocks ne sont **pas** des tests
Supabase Auth réels. Il reste le driver SQL privé, la vérification en
live de `auth.sessions`, l'Inbox et les validations concurrentes.

PR de travail : https://github.com/DIALLO575/atlas-hq/pull/38 .

## Inbox des validations en lecture seule — intégration SHA-150

Une API GET `/api/engines/approvals?workspaceId=...` et une page
`/engines/approvals` sont codées. Elles affichent uniquement les
métadonnées de demandes pending au reviewer owner/admin du workspace,
après vérification de la session et du rôle par Next ET par SQL,
avec contrôle de session active dans `auth.sessions`.

Les tests PostgreSQL jetables couvrent session révoquée/expirée,
rôle révoqué, absence de rôle, deux workspaces et interdiction
d'auto-approbation. Les migrations Supabase officielles sont
appliquées et vérifiées en lecture : 0 moteur, 0 run, 0 approbation ;
la fonction publique est SECURITY INVOKER, le definer est dans
`private`, le conseiller Supabase ne signale plus de fonction publique
privilégiée accessible.

**Non livré** : test E2E avec une vraie session reviewer,
l'interface de décision et la transaction d'approbation auditée,
KMS, worker et connexion MAUSBOT. Code sur GitHub ≠ site déployé.
