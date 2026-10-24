export const TEAM_CHANNEL_MUTATION_PLANS: readonly string[];
export const TEAM_CHANNEL_METADATA_READS: readonly string[];
export class TeamChannelContractError extends Error {
  readonly code: string; readonly status: number; constructor(code: string);
}
export function planTeamChannelMutation(name:string,input:Record<string,unknown>):
 Readonly<{primitive:string;method:string;path:string;body?:Readonly<Record<string,unknown>>;
 requiresHumanApproval:true;requiresWorkspaceAuthorization:true;requiresRuntimeOwnershipCheck:boolean;
 requiresDurableAudit:true;retryPolicy:"never-automatic";callable:false;hostTested:false;released:false}>;
export function planTeamCatalogRead(name:string):
 Readonly<{primitive:string;path:string;method:"GET";mode:"metadata-only";callable:false;hostTested:false;released:false}>;
export function executeTeamCatalogRead(config:{baseUrl:string;token:string},name:string,
 deps?:{fetchImpl?:typeof fetch}):Promise<Record<string,unknown>>;
export function planTeamCliInspection(action:string,args?:Record<string,unknown>):
 Readonly<Record<string,unknown>>;
