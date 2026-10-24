# ATLAS HQ — M0 Moteurs : bilan de livraison du 24 octobre 2026

**Note de livraison :** ce document accompagne la PR GitHub #33. Une
fusion dans main ne veut dire NI déploiement du site NI activation MAUSBOT.

## Réalisé et vérifié

| Domaine | Réalisation | Limite exacte |
| --- | --- | --- |
| 20 outils MCP officiels | Contrats, mappings HTTP et tests simulés | Aucun hôte MAUSBOT réel validé |
| 128 capacités natives | 24 lectures mock-testées, 42 plans de mutation offline, 5 plans binaires, 57 définitions source-only | Aucune des 128 capacités n'est disponible live; MCP et HTTP peuvent se recouper |
| Transports MCP/CLI/SSE | Contrats et tests offline | Ni worker réel, ni reprise transactionnelle |
| Interface Espace Moteurs | Catalogue et écran de préconnexion | Aucun moteur relié |
| API instances | GET métadonnées, POST réservé owner/admin, création uniquement offline | Disponibilité Web dépend du déploiement |
| Chiffrement | AES-256-GCM/HKDF-SHA256, clés versionnées, contexte tenant/instance, rotation mock-testée | Pas de vrai KMS ni de pilote d'accès private |
| Persistance | Deux migrations réelles dans Supabase ATLAS, neuf tables Engines avec RLS | Aucune exécution réelle ni secret opérationnel |
| Mutations moteur | Blocage HTTP 423 même avec anciens drapeaux env | Déverrouillage interdit avant vérification et approbations durables |

### Les deux migrations Supabase déjà appliquées

- 20261024161305_atlas_engine_foundation_preconnection : 9 tables
  dont 2 dans public (instances, runs) et 7 dans private.
- 20261024163943_atlas_engine_outbox_envelope_v1 :
  key_id et version NOT NULL sur la file chiffrée.

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
- CI sur la branche ne garantit pas la CI du commit main après fusion.
- Main, Vercel/Netlify, Supabase SQL et moteur MAUSBOT sont QUATRE
  états indépendants. Ne pas annoncer un déploiement sans preuve d'hôte.
