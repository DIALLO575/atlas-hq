# ATLAS × n8n — contrat hybride avant connexion (SHA-172 / PR01)

**Date :** 25 octobre 2026. **Statut :** conception et contrats **offline**. Aucune connexion à une instance n8n, aucun déploiement ni accès aux secrets. Les fonctionnalités n8n sont des possibilités **à vérifier sur un hôte et une version réels**, pas des capacités disponibles par défaut. [Épique SHA-171](https://linear.app/shadoron/issue/SHA-171), [PR01 SHA-172](https://linear.app/shadoron/issue/SHA-172).

## Frontières du produit ATLAS

- **Apps** : n8n apparaît dans Mes Apps comme connexion et ressource administrative, à terme dans `/apps/n8n` (PR03). La connexion ne doit pas transmettre de token au navigateur.
- **Moteurs** : n8n représente un moteur d'automatisations. Réutiliser `atlas_engine_instances` et la séparation des workspaces. Le catalogue courant ne connaît pas encore n8n et cette PR ne le modifie pas.
- **Agents & Équipes** : identités logiques liées à des agents IA n8n réellement disponibles. Un workflow ordinaire n'est pas forcément un agent.
- **Missions** : objectifs métier ATLAS, distincts des exécutions n8n. `atlas_engine_runs.mission_id` reste obligatoire aujourd'hui. Les exécutions planifiées autonomes nécessiteront un modèle séparé (PR04), pas une mission fictive ni une migration destructive.
- **Chief** : orchestrateur et politique d'approbation; le LLM libre de SHA-119 n'est pas connecté aujourd'hui.

```text
Frontend ATLAS (Supabase Auth SSR, aucun secret)
        |
BFF ATLAS : session -> workspace -> instance -> workflow -> capacité -> policy
        |
Sélection déterministe d'UN transport et d'UNE intention
      /                 |                     \
 REST n8n            MCP n8n             Webhook n8n
 gestion/lecture     construction IA     déclenchement/callback
      \_________________|_____________________/
                        |
        n8n workflow engine + stockage interne

Supabase Atlas : identité, grants, métadonnées, approbations, outbox, audit
```

## Séparation API / MCP / Webhooks

Une **intention Atlas** possède exactement un transport. Par exemple `workflows.import` (REST, création déterministe) est volontairement distinct de `workflows.ai.create` (MCP, construction via IA), et `workflows.invoke` (webhook) de `workflows.invoke_as_tool` (MCP). **Ne jamais faire de fallback d'une mutation après timeout** : le premier appel peut déjà avoir eu un effet externe.

| Intention Atlas | Transport | Mode | Portée | Preuve d'activation future |
|---|---|---|---|---|
| `workflows.list` | REST | read | instance | API publique workflows et grants |
| `workflows.get` | REST | read | workflow | API publique workflow et droits |
| `executions.list` | REST | read | workflow | API publique executions filtrée |
| `executions.get` | REST | read | execution | ID d'exécution + lien workflow vérifié |
| `workflows.import` | REST | write | instance | schéma API, droits, approbation |
| `workflows.ai.create` | MCP | write | instance | outil de création disponible et approuvé |
| `workflows.ai.validate` | MCP | read | instance | outil validation vérifié, sans lancement |
| `workflows.ai.update` | MCP | write | workflow | outil modification et approbation |
| `workflows.publish` | MCP | write | workflow | version compatible et approbation |
| `workflows.ai.test` | MCP | execute | workflow | sandbox et approbation (effets possibles) |
| `workflows.invoke` | webhook | execute | workflow | Webhook Trigger protégé et approuvé |
| `workflows.invoke_as_tool` | MCP | execute | workflow | outil de lancement, grants et approbation |
| `tools.discover` | MCP | read | instance | découverte filtrée des outils |

Le mapping vers **les vrais endpoints REST et noms MCP** est un chantier de PR02/PR07 : les IDs du tableau sont le langage produit ATLAS, **pas les noms officiels garantis par n8n**. Un outil de test peut produire des effets : il ne bénéficie pas d'un droit implicite au seul motif qu'il s'appelle « test ».

Le module `packages/engines/n8n/src/contracts.mjs` est une bibliothèque de **plans hors ligne** :
- `N8N_CAPABILITIES` porte le mode, le transport, le scope, la nécessité d'approbation et des booléens `available:false`, `callable:false`.
- `planN8nCapability` valide strictement workspace, instance, ID n8n opaque, empreinte d'intention et sélection du transport. Il refuse toute clé/token/URL/grant/validation du client. Il renvoie systématiquement `canDispatch:false` et `canEnqueue:false`.
- `summarizeN8nDiscovery` projette une **déclaration non fiable du fournisseur**; même une capability annoncée reste `available:false`, `callable:false`, `authorizationVerified:false`.

**Niveaux de preuve proposés :** catalogued (offline) -> advertised (non fiable) -> host-verified (test réel versionné) -> authorized (grants Atlas spécifiques à l'acteur, instance, ressource, session, intention) -> dispatched (reçu durable). Seul un composant serveur approuvé peut effectuer cette promotion.

## Autorisations, multi-tenant, données et secrets

L'identité de l'utilisateur est celle de Supabase, jamais celle qu'un client MCP prétend posséder. Le BFF puis le worker revérifient **session active, membership, rôle, workspace, instance, workflow, droit d'accès à la ressource et intention**. Aucun token administrateur n8n partagé ne doit être exposé aux utilisateurs ATLAS. Les scopes n8n et l'exposition MCP ne prouvent pas l'isolation des différents tenants Atlas. Pour un SaaS externe, comparer instances séparées, projets n8n isolés et licence n8n adaptée.

**Premier périmètre autorisé par la décision SHA-132 :** une instance n8n sandbox explicitement configurée, secret fixe dans l'environnement serveur du composant qui l'utilise; le fournisseur KMS externe est **différé**, sans prétendre offrir un coffre multi-client opérationnel. Aucun secret dans `NEXT_PUBLIC_*`, logs, navigateurs, URLs ou colonnes SQL en clair. Documenter rotation, révocation, kill-switch. Étendre ensuite `packages/engine-core/src/credential-lifecycle.mjs` et `vault.mjs` avec un stockage privilégié, après revue.

Les tables Engine Supabase existantes sont à réutiliser : `atlas_engine_instances`, `atlas_engine_runs`, `private.atlas_engine_approvals`, `private.atlas_engine_outbox`, `private.atlas_engine_event_receipts`, `private.atlas_engine_event_cursors`, `private.atlas_engine_audit_events`. **Ne pas exposer `private` dans la Data API.** N8n garde ses workflows et sa base opérationnelle, Atlas garde les références et permissions. Une synchronisation ne doit pas recopier inputs/outputs de nodes, credentials, prompts ou tokens.

## Chemin d'exécution durable (pas encore implémenté)

1. Acteur authentifié -> résolution de workspace, instance et workflow **depuis la base**, jamais depuis une URL fournie librement.
2. Vérification des permissions, ressources, risque, version et empreinte de l'intention; approbation humaine indépendante pour toute mutation ou lancement.
3. Création transactionnelle des métadonnées et d'une tâche outbox idempotente, après validation du modèle de données des automations autonomes.
4. Worker privé durable avec lease/fencing et **revalidation des droits immédiatement avant l'effet réseau**; exactement un transport sélectionné.
5. Reçu, `executionId`, callbacks vérifiés et réconciliation API; erreurs inconnues, timeouts après effet et réessais traités sans double mutation; retry borné, dead-letter et audit.
6. Version et transport, kill-switch, runtime et retours d'exécutions validés séparément du déploiement Next.js.

Dépendances ouvertes : [SHA-149](https://linear.app/shadoron/issue/SHA-149) secret serveur minimal, [SHA-150](https://linear.app/shadoron/issue/SHA-150) approbations, [SHA-151](https://linear.app/shadoron/issue/SHA-151) worker durable et tests de concurrence. L'existence des tables ne déverrouille pas les mutations. **Le verrou MAUSBOT HTTP 423 ne change pas.**

## Modèle de menace et tests requis

- **SSRF / DNS rebinding / redirects** : aucune URL arbitraire du navigateur; destination HTTPS administrée et vérifiée, IP/host private explicitement isolé en sandbox.
- **Prompt injection et MCP** : listes d'outils et résultats considérés non fiables, schémas stricts et allowlist serveur. Pas d'autorisation accordée à un texte retourné par n8n.
- **Cross-tenant** : workflow/execution ID identiques dans deux instances ne permettent pas d'accès transversal; clés composites et grants revérifiés.
- **Tokens / résultats sensibles** : jamais de logs des réponses brutes d'exécution, credentials ou contenu de nodes.
- **Timeouts/replay** : callback doublon, résultat retardé, worker tué avant/après effet, permission révoquée entre deux étapes et idempotency key réutilisée.
- **Différences de versions et licences** : capacités MCP/API soumises à découverte/compatibilité sur hôte réel, ne pas affirmer un support universel.

**Licence :** confirmer contractuellement l'usage n8n comme backend de SaaS externe et surtout la création/configuration de workflows par des utilisateurs externes (UI, API, MCP ou IA). Un simple canvas masqué ne dispense pas des conditions OEM/Enterprise. Décision licence **bloquante avant publication de builder pour clients externes**.

## Roadmap de PR (une PR / ticket)

PR01 [SHA-172] contrats & tests offline (celle-ci); PR02 [SHA-173] client REST serveur read-only; PR03 [SHA-174] Mes Apps + Moteurs; PR04 [SHA-175] workflow registry + sync Supabase; PR05 [SHA-176] autorisations/secret/worker commun; PR06 [SHA-177] exécution webhook + réconciliation; PR07 [SHA-178] MCP constructeur sous contrôle; PR08 [SHA-179] Atlas Action Gateway REST/MCP; PR09 [SHA-180] Chief/Agents/Missions; PR10 [SHA-181] E2E sandbox, licence et GO/NO-GO.

**Validation PR01** : `node --test tests/n8n-contracts.test.mjs` puis tests, TypeScript, ESLint, build et gitleaks en CI. Aucun endpoint, clé, migration, feature flag de prod ni exécution n8n dans cette PR. Suivre [AGENTS.md](../../AGENTS.md) : prévenir les pushes multiples et les previews inutiles.

## Références officielles n8n pour revues futures

- [API publique](https://docs.n8n.io/api/)
- [Authentification API](https://docs.n8n.io/api/authentication/)
- [MCP de l'instance n8n](https://docs.n8n.io/advanced-ai/accessing-n8n-mcp-server/)
- [Référence des outils MCP](https://docs.n8n.io/advanced-ai/accessing-n8n-mcp-server/mcp-server-tools-reference/)
- [Webhook Trigger](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.webhook/)
- [Wait](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.wait/)
- [Audit de sécurité n8n](https://docs.n8n.io/hosting/securing/security-audit/)
- [Guide de licence](https://support.n8n.io/article/can-i-use-your-license-for-my-use-case)

Ces références servent à vérifier les capacités et contraintes contre une **version n8n effectivement déployée**, et non à déclarer les contrats opérationnels.
