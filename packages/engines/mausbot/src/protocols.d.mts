export function planMausbotMcpCall(primitiveId: string, args?: Record<string,unknown>, requestId?: string | number):
  {jsonrpc: "2.0"; id: string | number; method: "tools/call"; params: {name: string; arguments: Record<string,unknown>}};
export function normalizeMausbotMcpResponse(data: string | unknown, expectedId: string | number):
  {acknowledged: true; hasToolResult: boolean};
export function parseMausbotSseBlock(block: string): Record<string,unknown> | null;
export function planMausbotCli(action: string, args?: Record<string,unknown>):
  {runtime: "external-durable-worker"; executable: "openmausbot"; argv: string[]; spawnAllowedOnVercel: false; shell: false};
export const MAUSBOT_MCP_TOOL_COUNT: number;
