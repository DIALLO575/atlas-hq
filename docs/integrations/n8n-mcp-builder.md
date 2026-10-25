# n8n MCP — SHA-178 / PR07 : planificateur et découverte hors ligne

**État : code/tests offline, PR en brouillon empilée sur PR06.** Aucun serveur MCP réel connecté, aucun jeton n8n, aucun call JSON-RPC sur un réseau, aucune création ou publication effective, aucun LLM ajouté à Chief et aucune modification SQL. Le verrou n8n partagé SHA-176 (HTTP 423 pour I/O fournisseur) ainsi que la contrainte SQL de l'instance offline restent actifs.

## Trois surfaces MCP à ne pas confondre

1. **Instance-level MCP server n8n** : l'agent Atlas serait client. Il peut éventuellement lister, valider, créer, modifier, tester, publier ou exécuter des workflows, selon l'instance, la version, les projets et les grants.
2. **MCP Server Trigger dans n8n** : expose des outils au niveau d'un workflow individuel ; ce n'est pas la console constructeur instance entière.
3. **MCP Client Tool dans n8n** : n8n devient client d'un MCP externe, notamment le futur Atlas Action Gateway (SHA-179).

La recherche `search_workflows` peut retourner des workflows visibles par l'utilisateur fournisseur qui ne sont PAS marqués `Available in MCP`. La découverte de noms et métadonnées n8n **ne prouve aucun droit d'accès Atlas**. Les résultats de `get_workflow_details` peuvent exposer nodes/credentials; ne jamais projeter les réponses brutes sur le frontend.

## Capabilités n8n répertoriées (pas activées)

| Intention Atlas | Outil d'instance n8n ciblé | Version n8n minimale conservatrice | Niveau de risque |
|---|---|---|---|
| `tools.discover` | `tools/list` (JSON-RPC protocole MCP) | n8n 2.12.0 pour cette matrice | lecture, discovery non fiable |
| `workflows.ai.validate` | `validate_workflow` | 2.12.0 | entrée code sensible, aucun grant |
| `workflows.ai.create` | `create_workflow_from_code` | 2.12.0 | écritures, attribution possible de credentials |
| `workflows.ai.update` | `update_workflow` | 2.12.0 | écriture avec version attendue |
| `workflows.publish` | `publish_workflow` | 2.12.0 | mise à disposition en production |
| `workflows.ai.test` | `test_workflow` | 2.15.0 | **execute** : certains nodes de code/I/O s'exécutent malgré les mocks/pins |
| `workflows.invoke_as_tool` | `execute_workflow` | 2.12.0 conservatrice | execute |

D'autres outils, notamment `search_workflows`, `get_workflow_details`, `search_projects`, `prepare_test_pin_data`, ne sont volontairement PAS activés par cette PR. Cela ne signifie pas qu'ils n'existent pas dans n8n. Leur politique de redaction/projection et leur périmètre fournisseur devront être spécifiés séparément.

## Les fonctions effectivement développées

- `inspectN8nMcpToolList` : inspection d'une réponse JSON-RPC `tools/list` **injectée et non fiable**. Limite à 100 noms, vérifie ID, noms et doublons, rejette erreurs et réponses mal formées ; retourne seulement des identifiants de capabilities prévus, sans descriptions, schémas, annotations ou clés. Un catalogue avec curseur est INCOMPLET. Même un outil présent reste `available:false` / `callable:false` / `authorizationVerified:false`.
- `planN8nMcpOperation` : vérifie UUID Atlas workspace/instance/workflow, semver attestée (en pratique non certifiée), champs autorisés, SHA256 du code, empreinte d'intention, clé idempotence et précondition de version pour écriture. Refuse URL, actor/role, token, tool arbitraire, raw code, grants et auto-approval. Renvoie toujours `providerIoEnabled:false` / `canCall:false` / `canEnqueue:false`.
- `createN8nMcpOfflineClient` : expose un brouillon immuable JSON-RPC `tools/list` et les planificateurs, mais `discover()` et `callTool()` échouent TOUJOURS avec 423, même si un transport injecté est fourni en test. Aucun endpoint Streamable HTTP ni échange réseau ici.

Cette PR n'est pas un **client Streamable HTTP authentifié opérationnel** : elle prépare son catalogue et les validations. Le vrai client devra négocier correctement les **versions MCP 2025-11-25 (initialize/session) et 2026-07-28 (stateless/server/discover)** lorsque cela correspond à la version supportée par l'instance n8n certifiée. Ne pas fixer une URL ou un token MCP d'après des exemples, ne pas supposer de transport stdio distant. Le serveur/dispatcher HTTP, la validation Origin, DNS/egress épinglé et la gestion des secrets seront réalisés et vérifiés dans une PR ultérieure.

## Workflow constructeur IA prévu, pas implémenté

`demande utilisateur -> brouillon d'intention -> version/allowlist/grants Auth Atlas -> validation de code et des nodes -> diff/impact -> approbation indépendante de l'intention immuable -> outbox commune -> opération MCP serveur -> relecture de la version distante -> reçu/audit/reconciliation`.

Les mutations ne contournent jamais les approbations Atlas; `test_workflow` ne bénéficie pas du droit de simple lecture. La publication exige une précondition de version, et les retries de mutation sont interdits si l'effet externe est inconnu.

**Licence n8n :** avant de permettre à des clients externes de créer, éditer ou configurer des workflows via une UI/IA Atlas, revue du modèle OEM/Enterprise et conditions contractuelles. L'utilisation interne a un périmètre différent : pas de généralisation sans décision.

**Tests PR07** : versions, faux inventaire MCP, injections d'annotations/descriptions, domaines de permissions, scopes, code en clair, tentatives publish/create/test non autorisées, injections de tools/call et bypass par variable d'environnement; contrôle que les callbacks transport ne sont jamais invoqués.

**Gates après PR07** : endpoints MCP live, OAuth/token et tenancy fournisseur, test avec n8n sandbox, Auth sessions, SQL grants, worker/outbox SHA-149/150/151, egress anti-rebinding, licence OEM si externe, et GO écrite. Aucune migration Supabase nécessaire pour le seul catalogue hors ligne.

Docs de référence officielles (versions à revalider lors de la certification) :
https://docs.n8n.io/connect/connect-to-n8n-mcp-server/
https://docs.n8n.io/connect/connect-to-n8n-mcp-server/mcp-server-tools-reference/
https://modelcontextprotocol.io/specification/2025-11-25/
https://modelcontextprotocol.io/specification/2026-07-28/
