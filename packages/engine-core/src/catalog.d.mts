export type EngineCapability = "agents.list" | "tasks.create" | "messages.send" | "jobs.read";
export type EngineTransport = "http" | "mcp-stdio" | "cli" | "sse";
export type EngineDefinition = {
  readonly id: string;
  readonly name: string;
  readonly phase: "adapter-v0" | "planned";
  readonly description: string;
  readonly transports: readonly EngineTransport[];
  readonly capabilities: readonly EngineCapability[];
};
export const ENGINE_CATALOG: readonly EngineDefinition[];
export const ENGINE_ID_PATTERN: RegExp;
export const MAUSBOT_OBJECT_ID: RegExp;
export const ATLAS_WORKSPACE_ID: RegExp;
