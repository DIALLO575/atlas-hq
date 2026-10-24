/**
 * Static IMPLEMENTATION capabilities, NOT evidence of authorization.
 * The effective rights require ATLAS membership + verified Notion grants.
 * The OAuth REST flow and MCP are intentionally not marked operational yet.
 */
export const NOTION_IMPLEMENTED_CAPABILITIES = Object.freeze({
  "pages.read": Object.freeze({ surface: "rest", implemented: true, requiresGrant: "read_content" }),
  "blocks.read": Object.freeze({ surface: "rest", implemented: true, requiresGrant: "read_content" }),
  "databases.read": Object.freeze({ surface: "rest", implemented: true, requiresGrant: "read_content" }),
  "search.title": Object.freeze({ surface: "rest", implemented: true, requiresGrant: "read_content" }),
  "pages.create": Object.freeze({ surface: "rest", implemented: false }),
  "pages.update": Object.freeze({ surface: "rest", implemented: false }),
  "webhooks.subscribe": Object.freeze({ surface: "webhooks", implemented: false }),
  "agents.mcp": Object.freeze({ surface: "mcp", implemented: false }),
});
export function effectiveNotionCapabilities({ connected = false, grants = [] } = {}) {
  const allowed = new Set(Array.isArray(grants) ? grants : []);
  return Object.fromEntries(Object.entries(NOTION_IMPLEMENTED_CAPABILITIES)
    .map(([name, definition]) => [name, Boolean(connected &&
      definition.implemented && allowed.has(definition.requiresGrant))]));
}
