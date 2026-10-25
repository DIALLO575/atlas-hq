/** Server-only SHA-173 n8n Public API adapter, GET-only. Never serialize config. */
export type N8nReadOnlyConfig = Readonly<{
  baseUrl: string;
  hostname: string;
  workspaceId: string;
  apiKey: string;
}>;
export type N8nReadOnlyDeps = Readonly<{
  fetchImpl?: typeof fetch;
  dnsLookup?: (hostname: string, options: { all: true; verbatim: true }) =>
    Promise<Array<{ address: string; family: number }>>;
  timeoutMs?: number;
}>;
export type N8nPageOptions = Readonly<{ limit?: number; cursor?: string }>;
export type N8nPage<T> = Readonly<{ data: readonly T[]; nextCursor: string | null; }>;
export type N8nWorkflowMetadata = Readonly<{
  id: string; name: string; active: boolean; createdAt: string | null; updatedAt: string | null;
}>;
export type N8nExecutionStatus = Readonly<{
  id: string; workflowId: string;
  status: "canceled" | "error" | "running" | "success" | "waiting" | "new" | "unknown";
  finished: boolean; startedAt: string | null; stoppedAt: string | null;
}>;
export class N8nReadOnlyError extends Error {
  constructor(code: string, status?: number, retryAfterSeconds?: number | null);
  code: string;
  status: number;
  retryAfterSeconds: number | null;
}
export function resolveN8nReadOnlyConfig(
  env: NodeJS.ProcessEnv, workspaceId: string,
): N8nReadOnlyConfig | null;
export function testN8nConnection(
  config: N8nReadOnlyConfig, deps?: N8nReadOnlyDeps,
): Promise<Readonly<{ reachable: true; api: "n8n-public-v1"; readOnly: true }>>;
export function listN8nWorkflows(
  config: N8nReadOnlyConfig, options?: N8nPageOptions, deps?: N8nReadOnlyDeps,
): Promise<N8nPage<N8nWorkflowMetadata>>;
export function getN8nWorkflowMetadata(
  config: N8nReadOnlyConfig, workflowId: string, deps?: N8nReadOnlyDeps,
): Promise<N8nWorkflowMetadata>;
export function listN8nExecutions(
  config: N8nReadOnlyConfig, workflowId: string,
  options?: N8nPageOptions, deps?: N8nReadOnlyDeps,
): Promise<N8nPage<N8nExecutionStatus>>;
export function getN8nExecutionStatus(
  config: N8nReadOnlyConfig, workflowId: string, executionId: string,
  deps?: N8nReadOnlyDeps,
): Promise<N8nExecutionStatus>;

export type N8nPublicAdminMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
export type N8nPublicAdminRequest = Readonly<{
  method: N8nPublicAdminMethod;
  path: string;
  query?: Readonly<Record<string, string | number | boolean>>;
  body?: Record<string, unknown> | unknown[];
}>;

/** Public /api/v1 only; caller must verify owner workspace & mutation consent. */
export function callN8nPublicAdminApi(
 config: N8nReadOnlyConfig, input: N8nPublicAdminRequest, deps?: N8nReadOnlyDeps
): Promise<Record<string, unknown>>;
