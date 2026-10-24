# SHA-135 — Politique des capacités Notion V2

**Portée :** premier lot d'implémentation du contrat V2. Aucune nouvelle migration Supabase, aucun webhook, aucune session MCP et aucune connexion fournisseur activée.

## Contrat et preuves

- Manifeste immuable des opérations séparées par REST, webhooks, MCP, agents, Workers et Admin Enterprise.
- Types de credentials indépendants : un OAuth REST n'autorise ni MCP ni Admin.
- Etats : not_implemented, built, configured, authorized, provider_verified, degraded. authorized atteste uniquement la session et la connexion personnelles autorisées dans ATLAS ; il **ne prouve pas les permissions Notion sur une page**.
- available=true uniquement pour une opération vérifiée en direct par le serveur avec preuve éphémère liée à utilisateur ATLAS, workspace ATLAS, connexion, workspace Notion et opération exacte. Jamais depuis les champs modifiables du registre ou depuis le navigateur.
- Preuves valides 60 secondes, sans persistance. Vérifier le bot confirme seulement users/me ; une recherche valide confirme seulement la recherche par titre, pas l'accès à toutes les pages.
- Opérations non implémentées (écritures, webhooks, MCP, Agent API, Admin) toujours indisponibles.

## Route et UI

- GET /api/apps/notion/capabilities?workspaceId=UUID&connectionId=UUID&verify=1 vérifie la session Supabase, le rôle admin dans le workspace, la connexion personnelle non révoquée et le registre associé.
- Le bouton Vérifier les capacités du Notion Control Center déclenche uniquement deux appels REST read-only : users/me et search par titre avec page_size=1. L'API retourne seulement des métadonnées d'état, ni jeton ni ressource Notion brute.
- Aucune élévation des scopes, écriture, configuration ou consommation automatique de MCP.

## Tests et limites de ce premier lot

Tests Node : preuve expirée/usurpée, mauvais utilisateur/workspace/connexion, mauvais type de credential, statut révoqué, absence de droits implicites et refus de preuve pour une opération non implémentée.

**À poursuivre dans SHA-135 :** ResourceRef typé, provenance et fraîcheur durables, vérifications de grants réels pour chaque type de ressource et adaptateurs de preuve séparés MCP/Workers/Admin. Pas encore développé.

Références :
- https://developers.notion.com/reference/capabilities
- https://developers.notion.com/reference/versioning
- https://github.com/DIALLO575/atlas-hq/blob/main/docs/operations/notion-supabase-main-release-2026-10-24.md
