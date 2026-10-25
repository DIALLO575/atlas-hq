export class N8nPreflightError extends Error {
  constructor(code: string);
  code: string;
  status: number;
}
export type N8nCapabilityScope = Readonly<{
  workspaceId: string;
  instanceId: string;
  workflowId?: string;
}>;
export type N8nPreflightRow = Readonly<{
  kind: "n8n-preflight-inspection";
  workspaceId: string;
  instanceId: string;
  workflowId: string | null;
  capability: string;
  mode: "read" | "write" | "execute";
  transport: "rest" | "mcp" | "webhook";
  providerGrantChecked: true;
  requiresHumanApproval: boolean;
  requiresDurableIdempotency: boolean;
  requiresEgressCertification: true;
  requiresReleaseMigration: true;
  requiresTrustedWorker: boolean;
  canEnqueue: false;
  canDispatch: false;
  providerIoEnabled: false;
  releaseCode: "N8N_DURABLE_RELEASE_GATE_CLOSED";
}>;
export type N8nPreflightTransaction = {
  sessionActive(actorId: string, sessionId: string): Promise<boolean>;
  workspaceRole(workspaceId: string, actorId: string): Promise<"owner" | "admin" | "member" | null>;
  getInstanceForScope(workspaceId: string, instanceId: string): Promise<unknown>;
  getWorkflowForScope(workspaceId: string, instanceId: string, workflowId: string): Promise<unknown>;
  capabilityGrant(input: {
    workspaceId: string; instanceId: string; workflowId: string | null;
    actorId: string; capability: string; mode: string;
  }): Promise<boolean>;
};
export function createN8nRuntimePreflight(input: {
  authenticate: (session: unknown) => Promise<{
    verified: true; actorId: string; sessionId: string;
  }>;
  repository: { transaction: <T>(fn: (tx: N8nPreflightTransaction) => Promise<T>) => Promise<T> };
}): Readonly<{
  inspect(input: {
    scope: N8nCapabilityScope;
    session: unknown;
    capability: string;
    intentDigest?: string;
    idempotencyKey?: string;
    executionId?: string;
  }): Promise<N8nPreflightRow>;
}>;
