export type NotionCapabilityStatus = "not_implemented" | "built" | "configured" |
  "authorized" | "provider_verified" | "degraded";
export type NotionSurface = "rest" | "webhooks" | "mcp" | "agents" | "workers" | "admin";
export interface NotionConnectionBinding {
  workspaceId: string; actorId: string; connectionId: string;
  notionWorkspaceId: string; surface: NotionSurface;
  credential: "notion_rest_oauth" | "notion_mcp_oauth" | "notion_webhook_subscription" |
    "notion_agent_api" | "notion_worker" | "notion_admin_org_bot";
  active: boolean;
}
export interface NotionEvidence {
  source: string; operation: string; surface: NotionSurface;
  workspaceId: string; actorId: string; connectionId: string;
  notionWorkspaceId: string; checkedAt: number;
}
export interface NotionCapability {
  id: string; surface: NotionSurface; credential: string; operation: string;
  apiVersion: string | null; planEligible: boolean | null;
  status: NotionCapabilityStatus; available: boolean; providerVerified: boolean;
  checkedAt: number | null; requiresApproval: boolean;
}
export const NOTION_CAPABILITY_SCHEMA: string;
export const NOTION_REST_API_VERSION: string;
export const NOTION_CAPABILITY_MANIFEST: ReadonlyArray<Readonly<{
  id: string; surface: NotionSurface; credential: string; operation: string;
  implemented: boolean; plan: string | null; description: string;
  apiVersion: string | null;
}>>;
export function evaluateNotionCapabilities(args?: {
  configuredSurfaces?: Partial<Record<NotionSurface, boolean>>;
  connectionBinding?: NotionConnectionBinding | null;
  providerEvidence?: ReadonlyArray<NotionEvidence>;
  failedOperations?: ReadonlyArray<string>;
  planEligibility?: Record<string, boolean>;
  checkedAt?: number;
}): { schema: string; generatedAt: number;
  evidenceScope: string; providerAuthenticationIsNotContentAuthorization: boolean;
  capabilities: ReadonlyArray<NotionCapability> };
export function notionCapabilityEvidence(args: {
  operation: string; connectionBinding: NotionConnectionBinding;
  checkedAt?: number;
}): NotionEvidence;
