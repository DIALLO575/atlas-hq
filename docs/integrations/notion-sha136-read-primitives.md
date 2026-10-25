# SHA-136 — Primitives REST de lecture avancée (source candidate)

Base GitHub au 25 octobre 2026 : `9d64498dceb6d80e0c126854bc02e0bbcae4f1f0`. Lot **code uniquement**, non exposé en route publique, non déployé et non validé en sandbox OAuth Notion réelle. Pas de migration, pas de nouvelle connexion, aucun flag changé.

Deux opérations serveur réutilisables sont préparées pour le client existant :
- `getPageProperty(pageId, propertyId, {startCursor,size,signal})` : GET `/v1/pages/{page_id}/properties/{property_id}` avec décodage/encodage sûr de l'ID de propriété, prise en charge de la réponse `property_item` ou `list`. Pagination demandée au plus 50.
- `queryDataSource(dataSourceId, {filter,sorts,startCursor,size,isArchived,signal})` : POST **de lecture** `/v1/data_sources/{id}/query`, jamais l'ancien `/v1/databases/{id}/query`. Filtre JSON récursif à profondeur/volume bornés, tri ≤5, page ≤50, résultats paginés. La méthode POST ne rejoue pas les réponses 5xx ou erreurs réseau ambiguës.

Les bâtisseurs `read-primitives.mjs` n'accèdent pas au réseau et sont conçus pour être appelés uniquement par un `createNotionReadClient` construit **après** authentification ATLAS, vérification de l'acteur/workspace/connexion Notion et budget. Les réponses provider sont brutes et **serveur uniquement** ; jamais de proxy JSON direct vers le navigateur ni de persistance de lignes. Ce lot ne crée ni base, ni page, ni vue, ni données en Supabase.

Prérequis d'activation : contrôle OAuth SHA-134 en workspace explicitement autorisé, tests 403/404 page non partagée, pagination et changements de droits, vérification réelle des filtres/sorts, dernière CI/typecheck/lint. Aucune écriture, webhook, worker, MCP ou agent activé.

Références fournisseur :
- https://developers.notion.com/reference/retrieve-a-page-property
- https://developers.notion.com/reference/query-a-data-source
