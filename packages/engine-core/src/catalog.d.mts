export type EngineCapability =
  | "system.health" | "agents.list" | "agents.create" | "agents.update"
  | "conversations.messages.list" | "conversations.messages.send" | "conversations.messages.edit"
  | "channels.list" | "channels.create" | "channels.update" | "channels.messages.list" | "channels.messages.send"
  | "tasks.create" | "tasks.activate" | "tasks.rename" | "search.messages"
  | "jobs.wait" | "jobs.interrupt" | "models.list" | "models.set"
  | "workflows.list" | "workflows.get" | "executions.list" | "executions.get"
  | "workflows.import" | "workflows.ai.create" | "workflows.ai.validate"
  | "workflows.ai.update" | "workflows.publish" | "workflows.ai.test"
  | "workflows.invoke" | "workflows.invoke_as_tool" | "tools.discover";
export type EngineTransport = "http" | "mcp" | "mcp-stdio" | "cli" | "sse";
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
