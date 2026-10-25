export type AtlasActionProvider = "github" | "linear" | "notion";
export type AtlasActionId = "github.repositories.list" | "linear.teams.list" | "notion.search.title";
export type AtlasActionSurface = "rest" | "mcp";
export type AtlasActionReadOnly = Readonly<{
  id: AtlasActionId;tool:string;provider:AtlasActionProvider;version:1;
  risk:"read";adapter:string;source:string;inputs:string;readOnly:true;
  implemented:true;available:false;callable:false;granted:false;
  requiresUserSession:true;requiresWorkspaceMembership:true;
  requiresVerifiedProviderGrant:true;requiresServerCredential:true;
  requiresResourceScope:true;requiresTrustedServerWorker:true;
}>;
export class AtlasActionGatewayError extends Error{
 constructor(code:string,status?:number);
 code:string;status:number;
}
export const ATLAS_ACTION_CATALOG: readonly AtlasActionReadOnly[];
export type AtlasReadActionDraft = Readonly<{
  kind:"atlas-action-read-draft";workspaceId:string;connectionId:string;
  actionId:AtlasActionId;provider:AtlasActionProvider;toolName:string;
  surface:AtlasActionSurface;risk:"read";args:Readonly<{query?:string}>;
  intentSha256:string;authorized:false;providerConnected:false;
  credentialShared:false;requiresActorAndMachineBinding:true;
  requiresCurrentWorkspaceAndUserGrant:true;
  requiresSourceConnectorAuthorization:true;
  requiresProviderEvidence:true;requiresBoundedOutputProjection:true;
  requiresAuditedRead:true;canRead:false;canWrite:false;
  canCall:false;canEnqueue:false;
}>;
export function planAtlasReadAction(input:{
 workspaceId:string;connectionId:string;actionId:AtlasActionId;
 args:Readonly<{query?:string}>;surface:AtlasActionSurface;
}):AtlasReadActionDraft;
export function planAtlasMcpTool(input:{
 workspaceId:string;connectionId:string;toolName:string;
 arguments:Readonly<{query?:string}>;
}):AtlasReadActionDraft;
export function projectAtlasActionCatalog(surface?:AtlasActionSurface):readonly Readonly<{
 id:AtlasActionId;version:1;provider:AtlasActionProvider;mode:"read";
 toolName:string;implemented:true;available:false;callable:false;
 authorized:false;source:string;inputSchema:Readonly<object>;
}>[];
export function createAtlasActionGatewayPreflight(input:{
 authenticate:(session:unknown)=>Promise<{verified:true;userId:string;sessionId:string}>;
 repository:{transaction:<T>(fn:(tx:{
 sessionActive:(userId:string,sessionId:string)=>Promise<boolean>;
 workspaceRole:(workspaceId:string,userId:string)=>Promise<string|null>;
 connectionForActor:(info:object)=>Promise<unknown>;
 providerReadGrant:(info:object)=>Promise<boolean>;
 })=>Promise<T>)=>Promise<T>};
}):Readonly<{
 inspect(input:{session:unknown;plan:AtlasReadActionDraft}):Promise<Readonly<{
  kind:"atlas-action-preflight-diagnostic";actionId:AtlasActionId;
  provider:AtlasActionProvider;workspaceId:string;connectionId:string;
  actorVerified:true;workspaceMembershipVerified:true;
  serverGrantChecked:true;requiresSourceConnectorRecheck:true;
  requiresAuditedRead:true;requiresVerifiedMachineBinding:true;
  canRead:false;canCall:false;canEnqueue:false;credentialShared:false;
 }>>;
 call():Promise<never>;toolsCall():Promise<never>;
}>;
