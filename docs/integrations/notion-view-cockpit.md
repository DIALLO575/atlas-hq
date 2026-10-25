# ATLAS HQ — Notion View Cockpit (interface uniquement)

Objectif : depuis **Mes Apps > Notion**, explorer les ressources **déjà partagées** avec une connexion OAuth REST personnelle, voir les **vues natives** d'une base (table, board, calendrier, timeline, galerie, liste, graphique, carte, dashboard...) et afficher un aperçu borné des pages correspondant à leurs filtres/tris enregistrés dans Notion. Lien direct officiel pour ouvrir la présentation complète. **ATLAS ne crée ni base, ni vue, ni copie durable des données Notion.**

## Surface préparée

- UI `/apps/notion` : en-tête, vraies connexions enregistrées, sélection d'une connexion, recherche par titre, ressources et prévisualisations, permissions et déconnexion. **Zéro connexion = état vide honnête**, aucune capture ou résultat simulé.
- Server GET `/api/apps/notion/views` avec `mode=list` + `sourceKind=database|data_source` et `resourceId` ou `mode=preview` + `viewId`. Les paramètres `workspaceId` et `connectionId` sont revalidés contre la session et le registre personnel via `loadNotionPersonalConnection`. Provider origin fixe. Un 401 utilise le refresh CAS existant, jamais plusieurs rotations à l'aveugle.
- Découverte : Notion `GET /v1/views?database_id|data_source_id`, 8 résultats max/page, hydrate au plus 8 références en lecture `GET /v1/views/{view_id}`. Sélection d'une vue : **une seule** requête `POST /v1/views/{view_id}/queries` (`page_size=12`) à la demande; ce POST crée une **cache de résultats temporaire côté Notion** et ne modifie pas la définition ni le contenu de la vue. Aucun polling, recherche globale non bornée, écriture ou synchronisation.
- Métadonnées et aperçus renvoyés au navigateur via allowlist : `id,name,type,url,editedAt` pour les vues; `id,kind,title,editedAt,url` pour les pages. URL externe HTTPS sur domaines Notion uniquement. Aucun token, schéma, filtre brut, résultat provider complet ou `query_id` n'est exposé. La mise en page Notion (board, chart, calendrier...) n'est **pas** recopiée dans ATLAS : l'aperçu est une liste limitée d'éléments filtrés et ordonnés, avec ouverture dans Notion pour le rendu interactif original.
- Ce code peut être présent dans `main` sans connexion OAuth réelle. Les flags OAuth, workers et scheduler restent désactivés par défaut ; toute activation fournisseur et décision GO demandent une recette distincte.

## Limites et preuves à obtenir

- Notion REST Views / View Queries sont documentés sous version 2026-03-11. Vérifier les capacités `read_content` / `read_property`, le consentement OAuth et l'accès explicite à la base avant d'afficher des vues.
- Les résultats des view queries peuvent être tronqués par Notion ou par la limite de 12 éléments. Le nombre déclaré par le fournisseur n'est pas un nombre garanti de lignes complètes. Les snapshots expirent côté Notion (~15 min); cette première interface ne les stocke pas et ne les nettoie pas explicitement; réduire les requêtes inutiles.
- Tester dans une sandbox autorisée : base avec plusieurs vues distinctes, vue avec filtre, page non partagée, deux acteurs et deux workspaces, 401/refreshed et refus 403/404. Pas de preuve fournisseur réelle tant que ces contrôles n'ont pas eu lieu.
- Pas d'édition de vues, d'écriture de lignes, d'affichage pixel-perfect ni de dashboard Notion embarqué (pas d'iframe/cookie provider).

Sources officielles :
- https://developers.notion.com/reference/list-views
- https://developers.notion.com/reference/retrieve-a-view
- https://developers.notion.com/reference/create-view-query
- https://developers.notion.com/guides/data-apis/working-with-views
