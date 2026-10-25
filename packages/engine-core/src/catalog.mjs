/**
 * ATLAS engine vocabulary. Engines are not "Apps" connectors.
 * A declared capability is not proof of a running, authorized installation.
 */
export const ENGINE_CATALOG = Object.freeze([
  Object.freeze({
    id: "mausbot", name: "MAUSBOT", phase: "adapter-v0",
    description: "Moteur multi-agents : bots, missions, conversations et jobs.",
    transports: ["http", "mcp-stdio", "cli", "sse"],
    capabilities: [
      "system.health", "agents.list", "agents.create", "agents.update",
      "conversations.messages.list", "conversations.messages.send", "conversations.messages.edit",
      "channels.list", "channels.create", "channels.update", "channels.messages.list", "channels.messages.send",
      "tasks.create", "tasks.activate", "tasks.rename", "search.messages",
      "jobs.wait", "jobs.interrupt", "models.list", "models.set",
    ],
  }),
  Object.freeze({
    id: "n8n", name: "n8n", phase: "adapter-v0",
    description: "Moteur de workflows : API REST lecture préparée, MCP et webhooks à certifier.",
    // SQL engine_instance transports accept http and mcp, not 'webhook'.
    // This catalog cannot authorize a network call.
    transports: ["http", "mcp"],
    capabilities: [
      "workflows.list", "workflows.get", "executions.list", "executions.get",
      "workflows.import", "workflows.ai.create", "workflows.ai.validate",
      "workflows.ai.update", "workflows.publish", "workflows.ai.test",
      "workflows.invoke", "workflows.invoke_as_tool", "tools.discover",
    ],
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
