export type N8nTransport = "rest" | "mcp" | "webhook";
export type N8nMode = "read" | "write" | "execute";
export type N8nScope = "instance" | "workflow" | "execution";
export type N8nCapabilityId =
  | "workflows.list" | "workflows.get" | "executions.list" | "executions.get"
  | "workflows.import" | "workflows.ai.create" | "workflows.ai.validate"
  | "workflows.ai.update" | "workflows.publish" | "workflows.ai.test"
  | "workflows.invoke" | "workflows.invoke_as_tool" | "tools.discover";
export type N8nCapability = Readonly<{
  id: N8nCapabilityId;
  transport: N8nTransport;
  mode: N8nMode;
  scope: N8nScope;
  requiresHumanApproval: boolean;
  available: false;
  callable: false;
}>;
export type N8nWorkflowRef = Readonly<{
  workspaceId: string;
  instanceId: string;
  workflowId: string;
}>;
export type N8nExecutionRef = N8nWorkflowRef & Readonly<{ executionId: string }>;
export type N8nTransportPolicy = Readonly<{
  capability: N8nCapabilityId;
  transport: N8nTransport;
  mode: N8nMode;
  requiresHumanApproval: boolean;
  requiresVerifiedActor: true;
  requiresWorkspaceGrant: true;
  requiresTrustedInstanceBinding: true;
  requiresRuntimeCapabilityVerification: true;
  available: false;
  canDispatch: false;
  canEnqueue: false;
}>;
export type N8nInstanceInfo = Readonly<{
  workspaceId: string;
  instanceId: string;
  engineKey: "n8n";
  status: "offline" | "preconnection" | "read-only";
}>;
export type N8nCapabilityPlan = N8nTransportPolicy & Readonly<{
  provider: "n8n";
  workspaceId: string;
  instanceId: string;
  workflowId?: string;
  executionId?: string;
  intentDigest?: string;
}>;
export type N8nDiscoverySummary = Readonly<{
  capability: N8nCapabilityId;
  transport: N8nTransport;
  advertised: boolean;
  available: false;
  callable: false;
  authorizationVerified: false;
}>;
export class N8nContractError extends Error {
  constructor(code: string);
  code: string;
  status: number;
}
export const N8N_TRANSPORTS: readonly N8nTransport[];
export const N8N_MODES: readonly N8nMode[];
export const N8N_CAPABILITIES: readonly N8nCapability[];
export function validateN8nRemoteId(value: unknown): string;
export function planN8nCapability(input: {
  workspaceId: string;
  instanceId: string;
  capability: N8nCapabilityId;
  workflowId?: string;
  executionId?: string;
  intentDigest?: string;
  transport?: N8nTransport;
}): N8nCapabilityPlan;
export function summarizeN8nDiscovery(input: {
  transport: N8nTransport;
  reportedCapabilities: readonly string[];
}): readonly N8nDiscoverySummary[];
