export type N8nMcpOperation = "tools.discover" | "workflows.ai.validate" |
 "workflows.ai.create" | "workflows.ai.update" | "workflows.publish" |
 "workflows.ai.test" | "workflows.invoke_as_tool";
export type N8nMcpMode = "read" | "write" | "execute";
export class N8nMcpOfflineError extends Error {
  constructor(code: string, status?: number);
  code: string; status: number;
}
export type N8nMcpToolPolicy = Readonly<{
  capability: N8nMcpOperation; tool: string | null; minVersion: string;
  scope: "instance" | "workflow"; mode: N8nMcpMode;
  discoveryOnly: boolean; requiresHumanApproval: boolean;
  available: false; callable: false;
}>;
export const N8N_MCP_OPERATION_POLICIES: readonly N8nMcpToolPolicy[];
export type N8nMcpDiscovery = Readonly<{
  kind: "n8n-mcp-discovery-draft"; n8nVersion: string;
  toolsInspected: number; complete: boolean; available: false; canCall: false;
  requiresHostVerification: true; requiresAtlasWorkspaceAndUserGrant: true;
  capabilities: readonly Readonly<{
    operation: N8nMcpOperation; providerTool: string | null; mode: N8nMcpMode;
    scope: "instance" | "workflow"; minVersion: string; versionCompatible: boolean;
    advertised: boolean; available: false; callable: false;
    authorizationVerified: false;
  }>[];
}>;
export function inspectN8nMcpToolList(input: {
  frame: unknown; requestId: number; n8nVersion: string;
}): N8nMcpDiscovery;
export type N8nMcpActionDraft = Readonly<{
  kind: "n8n-mcp-action-draft"; workspaceId: string; instanceId: string;
  workflowId: string | null; operation: N8nMcpOperation;
  providerTool: string | null; transport: "mcp"; mode: N8nMcpMode;
  n8nVersion: string; codeSha256?: string; intentDigest?: string;
  idempotencyKey?: string; expectedVersion?: string;
  requiresHumanApproval: boolean; requiresTrustedProviderBindings: true;
  requiresServerIdentityAndGrants: true;
  requiresReviewedLicenseForExternalCustomers: true;
  requiresEgressCertification: true; requiresDurableApprovedIntent: boolean;
  requiresCommonWorker: boolean; providerIoEnabled: false; canCall: false;
  canEnqueue: false; canPublish: false; releaseCode: string;
}>;
export function planN8nMcpOperation(input: {
  workspaceId: string; instanceId: string; operation: N8nMcpOperation;
  n8nVersion: string; workflowId?: string; codeSha256?: string;
  intentDigest?: string; idempotencyKey?: string; expectedVersion?: string;
}): N8nMcpActionDraft;
export function createN8nMcpOfflineClient(input?: {
  exchange?: (...args: unknown[]) => Promise<unknown>;
}): Readonly<{
  prepareDiscovery(input: {requestId: number;n8nVersion: string}):
    Readonly<{jsonrpc:"2.0";id:number;method:"tools/list";params:Readonly<Record<string,never>>;
     canSend:false;providerIoEnabled:false;}>;
  inspectDiscovery: typeof inspectN8nMcpToolList;
  planOperation: typeof planN8nMcpOperation;
  discover(): Promise<never>;
  callTool(): Promise<never>;
}>;
