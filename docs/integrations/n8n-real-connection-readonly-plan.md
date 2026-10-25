# n8n → Atlas : étape de connexion sécurisée (25/10/2026)

## Instance réelle observée
- Adresse confirmée : **https://ops.shadoron.com** ; reverse proxy Caddy vers **127.0.0.1:5678** sur le VPS SHADORON.
- Image/version : **docker.n8n.io/n8nio/n8n:2.43.5** ; conteneur **shadoron-n8n** running, readiness local et public HTTP 200 ; HTTPS valide.
- API publique **GET /api/v1/workflows** sans clé : **HTTP 401** (contrôle d'accès présent).
- L'instance est actuellement utilisée par SHADORON ; son domaine public est connu mais **cela ne prouve pas qu'elle soit dédiée ou isolée pour ATLAS**.
- Les variables **ATLAS_N8N_*** ne figurent pas dans l'inventaire visible du projet Vercel ATLAS (inspection par NOMS seulement, sans déchiffrer de secrets). Aucun accès Atlas réel n'est donc encore possible.

## Code livré : HTTPS épinglé au résultat DNS public

Le connecteur REST lecture seule existant vérifiait l'IP via DNS mais utilisait ensuite un \`fetch\` classique, susceptible de refaire la résolution. La nouvelle implémentation utilise directement **\`node:https.request\`** avec \`lookup\` explicite lié à l'IP publique contrôlée :

1. Le hostname du destinataire provient de la configuration serveur (jamais du navigateur). URL strictement HTTPS/443, hostname de l'allowlist et espace Atlas précis.
2. Tous les enregistrements DNS sont résolus et examinés : toute IP privée/loopback/mappée/réservée fait refuser **toute la requête**.
3. Une seule IP publique validée est épinglée comme destination de la connexion TLS ; le hostname original est préservé dans l'URL, SNI et la vérification de certificat. Pas de DNS supplémentaire sur le chemin du socket.
4. Méthode **GET** uniquement, aucune redirection, pas de cookies ni de proxy applicatif, timeout maximum 10 secondes, réponse JSON max 1 Mio, aucune donnée de nœud/credentials/raw execution n'est projetée.
5. Les adaptateurs de tests \`fetchImpl\`/\`httpsRequestImpl\` sont **injectés exclusivement au niveau du test**, jamais depuis une requête HTTP Atlas.

Même avec épinglage DNS/TLS, ajouter ensuite une règle d'egress réseau explicite est recommandé pour une défense complémentaire ; cette PR ne prétend pas régler les politiques de réseau du VPS ou de Vercel.

## Étape opérationnelle bloquante : l'identité ATLAS

**Ne pas utiliser les identifiants du SHADORON Chief/n8n existant**, ni extraire des secrets Docker. Le propriétaire doit d'abord décider si \`ops.shadoron.com\` accepte un **projet n8n dédié Atlas** et un compte n8n séparé sans accès aux workflows SHADORON, ou si une sandbox distincte doit être provisionnée.

Sur l'interface n8n, avec un compte autorisé :

1. Créer un projet/compte Atlas avec droits de lecture limités aux workflows de test Atlas. Avant toute création de clé, vérifier les limites de l'édition n8n installée et du rôle utilisateur.
2. Dans **Settings → n8n API → Create API key**, utiliser un libellé tel que \`atlas-workflow-inventory-readonly\` et une expiration courte. Sur **Enterprise**, sélectionner \`workflow:list\` (puis \`workflow:read\` uniquement pour lecture détaillée). Sur d'autres éditions, les clés API **ne disposent pas de scopes granulaires** : limiter impérativement les ressources visibles au compte et au projet; ne pas prétendre à une clé cryptographiquement read-only.
3. Configurer **environnement serveur Atlas uniquement** : \`ATLAS_N8N_BASE_URL=https://ops.shadoron.com/\`, \`ATLAS_N8N_ALLOWED_HOST=ops.shadoron.com\`, \`ATLAS_N8N_WORKSPACE_ID=<UUID Atlas vérifié>\`, \`ATLAS_N8N_API_KEY=<clé Atlas séparée>\` (sensitive/encrypted dans Vercel ou stockage de secrets, **jamais** dans GitHub ou une conversation).
4. Vérifier l'identité de l'utilisateur via Supabase Auth et son workspace; la clé ne doit jamais être envoyée au navigateur. Tester l'accès dans **l'environnement staging isolé** et valider les workflows réellement accessibles avant de proposer l'inventaire à Mes Apps.

**Aucun élément de cette procédure n'a encore été exécuté sur n8n ou Vercel.** Ne pas déclarer l'instance connectée tant qu'il n'existe pas de clé propre Atlas et une réponse API 200 authentifiée limitée aux bons workflows.

## Garde de publication inchangée

Les points d'entrée Atlas existants lisent seulement la base RLS; le gate \`n8nReleasePermission\` reste **HTTP 423** pour provider read/write/execute. La contrainte SQL \`atlas_n8n_runtime_offline_only\` reste active en production. **Ce correctif de transport n'ajoute pas d'endpoint REST opérationnel ni d'appel réel** : il prépare un chemin réseau techniquement sûr pour une future PR d'activation de lecture isolée, revue, avec l'E2E Auth et les permissions attestées.

Références officielles : https://docs.n8n.io/connect/n8n-api/authentication/ et https://docs.n8n.io/connect/n8n-api/api-reference/
