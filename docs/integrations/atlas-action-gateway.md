# PR08 / SHA-179 — Atlas Action Gateway REST + MCP (catalogue sécurisé OFFLINE)

**État exact :** implémentation d'un catalogue commun et d'un précontrôle mock, API GET authentifiée du catalogue; aucun endpoint REST d'exécution, aucun MCP server Streamable HTTP exposé, aucune session machine n8n, aucune écriture ni lecture de fournisseur en vrai, aucune migration Supabase. La demande Linear d'une *lecture réelle depuis n8n sandbox* reste ouverte.

## Capacités GitHub / Linear / Notion réellement présentes dans le code

Un **seul** manifest `packages/action-gateway/src/catalog.mjs` réutilise des dépendances des connecteurs :
- GitHub `createAuthorizedGitHubReader` et l'opération **listRepositories** : le code existant est source de vérité, exige installation vérifiée, liste d'IDs autorisés ou sélection 'all', clé GitHub App côté serveur et jeton d'installation en lecture seule. Ne pas confondre avec GitHub Studio PR/write/actions.rerun : non autorisés par le gateway.
- Linear `readLinearResourceRoute` pour **teams** et sa taille fixe 25 : connexion personnelle à l'acteur, scopes `['read']`, identité viewer/org prouvée, refresh rotation SQL déjà implémenté. **Ne pas donner le token Linear personnel à n8n** et ne pas convertir une identité machine en utilisateur.
- Notion capacités `NOTION_IMPLEMENTED_CAPABILITIES['search.title']` avec `loadNotionPersonalConnection().client.searchByTitle` : la recherche titre ne prouve pas les permissions de lire toutes les pages; son OAuth reste personnel, revocable et par connexion. La configuration Notion MCP/agents n'est pas opérationnelle.

Le catalogue n'expose donc que **trois lectures** : `github.repositories.list`, `linear.teams.list`, `notion.search.title`. Chaque ligne porte `implemented:true` mais **`available:false` / `authorized:false` / `callable:false`**. C'est un état véridique : le code source existe, pas les permissions d'action d'une machine n8n.

## Modèle d'intention canonique

`planAtlasReadAction` n'accepte que `workspaceId, connectionId, actionId, args, surface`; surface REST/MCP conduit au **même SHA-256 d'intention canonique**, et un identifiant stable d'outil Atlas (`atlas_github_repositories_list`, `atlas_linear_teams_list`, `atlas_notion_search_title`). Aucun URL, provider token, actor/role, approbation, origine, installation GitHub fournis par l'appelant ne peuvent être insérés dans une action. GitHub et Linear ne prennent ici aucun argument; Notion autorise seulement un titre string de 0 à 100 caractères sans caractères de contrôle.

`projectAtlasActionCatalog('rest'|'mcp')` retourne le **même** contrat typé pour les deux canaux, avec schémas minimaux, les mêmes risques de lecture et tous les drapeaux d'accès `false`. Ce n'est **pas** un vrai `tools/list` MCP exposé à n8n.

## Sécurité de la future exécution

`createAtlasActionGatewayPreflight` utilise des adaptateurs **injectés** (mocks en PR08), non l'accès SQL réel : reconnexion à session active Auth, membership workspace, connexion fournisseur *personnelle à l'acteur*, preuve d'un grant par opération; reconstruit et vérifie le SHA canonique, provider et toolName sans faire confiance au plan. Le résultat est uniquement un diagnostic, `canRead:false`; aucun token ni actorId dans la projection. Toute tentative de `call()` ou `toolsCall()` retourne 423.

Pour activer réellement une lecture depuis n8n, il faudra un **principal machine Atlas** vérifié (pas un token n8n global sans scoping), un run en cours et un acteur déléguant explicitement la connexion, une transaction Auth/session et vérification de permission actuelles, plus l'adaptateur Connecteur qui gère quotas, refresh et réponse limitée. Le traitement doit être identique qu'il soit reçu par le BFF HTTP ou MCP, sans proxy d'URL arbitraire ni catalogue d'outils mutables. Le token fournisseur ne sort jamais de l'espace serveur Atlas. En cas de révocation ou permission insuffisante, l'accès doit être fermé avant tout I/O.

## API HTTP ajoutée

`GET /api/actions/catalog?workspaceId=<UUID>[&surface=rest|mcp]` requiert Supabase Auth + membership via `requireEngineWorkspace`, rejette les paramètres non prévus/doublés et renvoie une liste de **capacités implémentées mais désactivées**, sans données de clients ou credentials. Aucun `POST` d'action ni endpoint MCP public.

## Tests, dépendances, publication

Les tests vérifient les invariants GitHub/Linear/Notion, manifest identique REST/MCP, canonisation d'intention, rejets injection de tool/URL/secret/role, confusion de fournisseur, connexion d'un autre workspace, session révoquée, absence de grant, non-invocation d'un vrai provider et route session-scoped.

La PR08 est empilée sur PR07 et reste **DRAFT**. Aucun SQL en prod nécessaire. L'objectif SHA-179 de vraie lecture via n8n sandbox reste **non atteint** tant que SHA-149, 150, 151, 176, 177, 178 n'ont pas de preuves d'identité/approbation/outbox, machine OAuth/credential store et egress DNS-résistant. Ne pas présenter cette PR comme une Action Gateway live, ni livrer une UI externe permettant aux clients d'éditer des workflows avant la revue de licence n8n.

Sources : source du dépôt Atlas, https://modelcontextprotocol.io/specification/2026-07-28/server/tools et https://docs.n8n.io/integrations/builtin/cluster-nodes/sub-nodes/n8n-nodes-langchain.toolmcp .
