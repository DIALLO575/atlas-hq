# SHA-186 — Official Notion Markdown v1, safe preview

**Source candidate, not deployed.** Official `GET /v1/pages/{page_id}/markdown` returns `page_markdown`, `truncated`, `unknown_block_ids`. Default `v1` Enhanced Markdown is used; `v2` is opt-in preview and out of scope. Media in provider Markdown can contain presigned URLs and must stay server-side.

- REST client: fixed Notion origin GET and UUID, validates provider object/resource ID, flags and unknown IDs, rejects source above 64k characters.
- Projection: returns only bounded typed lines (100 lines / 12k characters), redacts external link targets, unsafe embedded tags and media; never exposes original Markdown, signed URL, provider bearer or raw unknown block IDs. `lossy=true` is intentional. No Markdown write, round-trip promise or HTML rendering.
- Route: `GET /api/apps/notion/read?kind=markdown` uses normal authenticated, workspace-scoped connection. Cursor invalid for Markdown, refresh-token handling only on a verified 401.
- Cockpit: explicit button « Voir la lecture Markdown » on a selected page. Browser sees safe text only, with warnings for inaccessible/unknown blocks.
- Verification: tests mock, typecheck/lint/Next build; provider OAuth SHA-134 and real media security review still blocked by Vercel 402. OAuth callback remains OFF. Main branch untouched.
- Docs: https://developers.notion.com/guides/data-apis/working-with-markdown-content
