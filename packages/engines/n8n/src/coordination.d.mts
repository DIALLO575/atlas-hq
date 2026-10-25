export class N8nCoordinationError extends Error{
  constructor(code:string);code:string;status:number;
}
export type N8nCoordinationView=Readonly<{
  source:"atlas-registry";engine:"n8n";workspaceId:string;missionId:string|null;
  workflowCountShown:number;executionCountShown:number;
  workflowListTruncated:boolean;executionListTruncated:boolean;
  workflows:readonly Readonly<{
    id:string;instanceId:string;name:string;
    syncState:"unverified"|"observed"|"missing";lastSeenAt:string|null;
  }>[];
  executions:readonly Readonly<{
    id:string;workflowId:string;missionId:string|null;
    workflowName:string|null;
    status:"unknown"|"new"|"running"|"waiting"|"success"|"error"|"canceled";
    startedAt:string|null;stoppedAt:string|null;lastSeenAt:string|null;
  }>[];
  certifiedAgentCount:null;agentCertification:"not-verified";
  providerConnected:false;liveSyncEnabled:false;canStartWorkflow:false;
  canAttachAgent:false;canApprove:false;provenance:"stored-metadata-only";
}>;
export function projectN8nCoordination(input:{
  workspaceId:string;missionId?:string|null;
  workflowRows:readonly unknown[];executionRows:readonly unknown[];
}):N8nCoordinationView;
