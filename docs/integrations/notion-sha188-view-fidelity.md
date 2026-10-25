# SHA-188 — Vue native : provenance, filtres et cache temporaire

25 octobre 2026 — **code candidat non déployé**.

Notion `2026-03-11` : `GET /v1/views/{view_id}` renvoie `parent.database_id`, `data_source_id`, `filter`, `sorts`, `quick_filters`, `configuration`. Une vue peut être liée à un autre conteneur : ATLAS compare la vue au `resourceId` de la base/source sélectionnée dans une connexion utilisateur ATLAS personnellement autorisée. Les vues hors périmètre sont ignorées lors de la liste ; une demande d'aperçu mismatched reçoit 404, sans critères confidentiels.

Projection en liste blanche via `projectNotionViewMetadata` : nom limité, type, URL notion.com, identifiants de conteneur/source validés, `hasFilter`, `sortCount`, `quickFilterCount`, `hasGrouping`, `layoutConfigured`. Critères des filtres, expression de group-by, emails du créateur et tableau provider complet restent serveur uniquement.

Snapshot `POST /v1/views/{view}/queries` est une **opération de lecture du contenu de vue**, pas une écriture de page. La première page (12 items max) est projetée, puis ATLAS appelle `DELETE /v1/views/{view}/queries/{query_id}` sur chemin strict : **supprime seulement le résultat de requête temporaire**, pas la vue, page ou data source. Notion documente cette suppression sous les permissions `read_content/read_property` ; elle est recommandée. Pas de pagination automatique d'un snapshot, pas de query ID ni filtre brut envoyé au navigateur, pas de retry du DELETE après issue incertaine. Si cleanup échoue, `queryReleased=false` et la ressource temporaire expire automatiquement chez Notion (~15 min).

Le navigateur ne se fait pas passer pour un Kanban/calendrier natif complet ; il garde l'aperçu des pages filtrées/triées par Notion et un lien vers la vue officielle. Aucune migration SQL, aucun OAuth réel, aucun worker, aucun Vercel. QA à consigner séparément; `provider_verified=false`, `deployed=false`.

Source officielle : https://developers.notion.com/guides/data-apis/working-with-views
