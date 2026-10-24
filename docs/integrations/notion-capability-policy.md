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

## Ressources et provenance (deuxième lot SHA-135)
- `resource-reference.mjs` crée un ResourceRef typé (page/block/database/data_source), validé sur `object` et `id` du **GET provider réussi**, qui contient seulement IDs d'isolation, `sourceVersion` (`last_edited_time` si fourni), version API et horodatage ; jamais le payload complet.
- Les preuves REST pages/blocks/databases/data_sources sont maintenant **scopées à une ressource unique** ; une preuve pour page A ne rend pas le droit `rest.pages.retrieve` globalement disponible et ne peut pas être réutilisée pour page B.
- GET `/api/apps/notion/capabilities?verify=1&resourceKind=page&resourceId=UUID&workspaceId=...&connectionId=...` réalise un GET Notion dans la session serveur et produit la preuve courte. Idem pour `block`, `database`, `data_source`. Un 401 peut déclencher une seule rotation durable avant retry du GET. Les refus 403 et les ressources non partagées/inconnues 404 ne fabriquent pas de preuve.
- Dans les résultats de recherche du Control Center, le bouton « Vérifier l'accès à cette ressource » compare l'identité de ressource renvoyée et présente un résultat honnête et indépendant de la recherche par titre.
- **Pas de stockage de preuve durable, pas de migration Supabase** dans ce lot. La fraîcheur en mémoire vaut 60 secondes ; la persistance de provenance (avec purge, RLS et invalidation sur révocation) sera étudiée dans le chantier ultérieur, après validation sandbox.
