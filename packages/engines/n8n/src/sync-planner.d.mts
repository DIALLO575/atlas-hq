export type N8nSyncWorkflowMetadata = Readonly<{
  id: string;
  name: string;
  active: boolean;
  createdAt: string | null;
  updatedAt: string | null;
}>;
export type N8nWorkflowSyncDraft = Readonly<{
  kind: "n8n-workflow-sync-draft";
  workspaceId: string;
  instanceId: string;
  rows: readonly Readonly<{
    workspace_id: string;
    instance_id: string;
    remote_workflow_id: string;
    name: string;
    remote_active: boolean;
    remote_created_at: string | null;
    remote_updated_at: string | null;
    sync_state: "unverified";
  }>[];
  canPersist: false;
  canMarkMissing: false;
  canDispatch: false;
  requiresTrustedServerSnapshot: true;
  requiresCompleteCursorWalkForMissing: true;
}>;
export function planN8nWorkflowSync(input: {
  workspaceId: string;
  instanceId: string;
  workflows: readonly N8nSyncWorkflowMetadata[];
}): N8nWorkflowSyncDraft;
