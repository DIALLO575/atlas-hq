/**
 * ATLAS engine vocabulary. Engines are not "Apps" connectors.
 * A declared capability is not proof of a running, authorized installation.
 */
export const ENGINE_CATALOG = Object.freeze([
  Object.freeze({
    id: "mausbot", name: "MAUSBOT", phase: "adapter-v0",
    description: "Moteur multi-agents : bots, missions, conversations et jobs.",
    transports: ["http", "mcp-stdio", "cli", "sse"],
    capabilities: ["agents.list", "tasks.create", "messages.send", "jobs.read"],
  }),
  Object.freeze({
    id: "hermes", name: "Hermes", phase: "planned",
    description: "Futur adaptateur : aucune compatibilite ne doit etre supposee.",
    transports: [], capabilities: [],
  }),
]);

export const ENGINE_ID_PATTERN = /^[a-z][a-z0-9-]{1,63}$/;
export const MAUSBOT_OBJECT_ID = /^[A-Za-z0-9_-]{1,120}$/;
export const ATLAS_WORKSPACE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
