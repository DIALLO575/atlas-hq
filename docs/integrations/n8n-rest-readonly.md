# ATLAS × n8n — Adaptateur REST read-only (SHA-173 / PR02)

**Statut : bibliothèque serveur et tests mock; aucun hôte n8n branché, aucun endpoint BFF, aucune migration, aucune clé réelle ni activation production.** Branche empilée sur SHA-172 / PR #57 (draft).

## API publique et opérations

Le protocole cible est l'API publique n8n v1 : en-tête X-N8N-API-KEY, pagination par curseur, lecture GET.

- GET /api/v1/workflows?limit=1 — testN8nConnection, sonde lecture seule.
- GET /api/v1/workflows?limit=&cursor= — listN8nWorkflows, projection id/name/active/timestamps.
- GET /api/v1/workflows/{id} — getN8nWorkflowMetadata, vérification de l'identifiant retourné.
- GET /api/v1/executions?workflowId=&includeData=false — listN8nExecutions, vérifie workflowId de chaque résultat.
- GET /api/v1/executions/{id}?includeData=false — getN8nExecutionStatus, vérifie workflowId ET executionId.

Tous les retours excluent les nodes, credentials, paramètres, scripts, prompts, raw execution data et erreurs fournisseur. La sonde confirme seulement qu'une requête de lecture a été acceptée, pas toutes les capacités n8n.

## Configuration pilote : exclusivement sur le serveur

Variables attendues, à provisionner seulement en environnement sandbox après approbation :

    ATLAS_N8N_WORKSPACE_ID=<sandbox-atlas-workspace-uuid>
    ATLAS_N8N_BASE_URL=https://n8n.your-company.example/
    ATLAS_N8N_ALLOWED_HOST=n8n.your-company.example
    ATLAS_N8N_API_KEY=<server-stored-api-key>

Le domaine donné est uniquement un EXEMPLE, pas une destination à utiliser. resolveN8nReadOnlyConfig retourne null si aucun workspace explicitement associé. Le secret ne doit jamais être sérialisé, transmis au navigateur, mis dans NEXT_PUBLIC, dans un log ni dans un champ de base en clair. Le résolveur exige HTTPS, port 443, domaine autorisé exact, pas d'IP, de wildcard, d'userinfo, de chemin, query ni fragment. Une seule instance/workspace pour le pilote; aucune isolation SaaS externe démontrée.

## Contrôles déjà codés

Uniquement GET; aucune primitive d'écriture, de webhook ou MCP. En-têtes fixes, pas de redirection, cache désactivé, timeout 1–10 s, réponse JSON bornée à 1 MiB, pagination maximum 100 items, curseurs bornés et encodés, contrôle des identifiants. Erreurs fixes N8nReadOnlyError sans exposition d'en-têtes ou corps upstream. 429 expose retryAfterSeconds (max 3600) et ne relance pas automatiquement. Autorisations 401/403 refusées. Le statut non reconnu devient unknown, jamais un succès inventé.

Le contrôle DNS préliminaire refuse les adresses de boucle locale, privées, link-local, metadata IP, documentation/réservées et réponses mixtes, ainsi que les hôtes .local/.internal/.localhost/.test et .invalid. Ceci n'empêche PAS à lui seul une attaque DNS rebinding : le lookup et la connexion TCP faite par fetch ne sont pas épinglés sur la même IP. Avant un appel réseau réel, mettre en place un proxy/egress gateway avec validation de chaque destination IP (ou un dispatcher approuvé avec lookup épinglé) et interdire les redirections au niveau réseau. Une destination n8n dans un VPC nécessite un modèle de sécurité spécifique, pas une désactivation ad hoc.

## Intégration Atlas à venir (PR03)

La couche REST n'est PAS un service d'autorisation. Le BFF devra vérifier session Supabase, rôle, membership, workspace, instance ET grants sur le workflow avant d'appeler cette bibliothèque. Un identifiant distant n8n ou une clé d'instance ne constitue pas une permission. Une erreur 404 peut être un défaut d'accès; ne pas exposer les permissions des autres espaces. Aucune route Next.js nouvelle dans PR02.

## Tests et preuves

12 tests Node mockés ciblent : config et host, isolation workspace, méthode GET, pagination/cursor, contenu minimal, identités, refus des champs externes, DNS privé, redirects, 401/403/404/429/5xx, réseau inaccessible, payloads volumineux et données sensibles. Tests localement validés sur Node 22; la CI principale npm test/typecheck/lint/build + gitleaks doit confirmer dans GitHub.

Références officielles : https://docs.n8n.io/connect/n8n-api/api-reference/ et https://docs.n8n.io/connect/n8n-api/pagination/ .

**Gate** : rester draft tant que PR01 n'est pas intégrée, CI/revue non validées ou infrastructure egress absente. Aucun secret et aucune connexion n8n à ce stade.