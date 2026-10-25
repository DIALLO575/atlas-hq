# SHA-187 — Read-only Notion database/data source explorer (source candidate)

**25 octobre 2026**. Documented API version `2026-03-11`, official operations `GET /v1/databases/{id}`, `GET /v1/data_sources/{id}`, `POST /v1/data_sources/{id}/query` (query **reads rows**, not mutations). Views use separate `GET /v1/views`, `POST /v1/views/{id}/queries` and may have their own filters and sorts. A data source preview is **not** a full reproduction of a native Notion board/calendar/gallery.

- New pure projectors `data-source-projection.mjs`: bounded `database.data_sources` references (max 30), columns metadata (max 14, whitelist of types), statuses/select options (max 12) and 12 rows/page. Formula results and relation counts only, no expressions or target IDs; file counts only, never signed URLs; people counts and emails/phone masked. Native Notion page links validated to notion.com hosts.
- `GET /api/apps/notion/data?mode=discover|schema|rows&resourceId=UUID` validates UUID/cursor, rejects browser-supplied URL/filter/sorts, requires authenticated personal connection through ATLAS reader, refresh CAS 401 once; sends **only** projected response. All headers private/no-store.
- Row pagination at most 12 per request, and one bounded data source schema fetch per page; no background sync, no clone Supabase, no writes, no worker. Unknown/missing relational properties explicitly unsupported.
- New UI to display sources and rows is prepared separately. Before GO: run full Next/build/types/lint/tests on exact SHA; then real Notion OAuth authorization to only safe test page and source; cross-tenant isolation and revocation per SHA-134. OAuth OFF, previous Vercel quota 402. No main merge.

References: https://developers.notion.com/reference/retrieve-a-data-source and https://developers.notion.com/reference/query-a-data-source and https://developers.notion.com/reference/retrieve-a-view
