export class EnginePersistenceInputError extends Error {
  readonly code:string;readonly status:number;constructor(code:string);
}
export function planEngineRegistration(input:Record<string,unknown>):Readonly<{
kind:"engine-registration";workspaceId:string;createdBy:string;engineKey:string;
label:string;transport:string;connectionState:"offline";requiresOwnerOrAdmin:true;
callable:false;released:false;hostTested:false;requiresAuthenticatedActor:true;
requiresDatabaseAuthorization:true;requiresDurableAudit:true}>;
export function planEngineRunDraft(input:Record<string,unknown>):Readonly<{
kind:"engine-run-draft";workspaceId:string;instanceId:string;missionId:string;
requestedBy:string;engineKey:"mausbot";primitiveId:string;primitiveMode:string;
idempotencyKey:string;payloadSha256:string;state:"draft";canEnqueue:false;
callable:false;released:false;hostTested:false;
requiresHumanApproval:boolean;requiresIndependentApproval:boolean;
requiresMissionBinding:true;requiresInstanceBinding:true;requiresEncryptedOutbox:true;
requiresAuthenticatedActor:true;requiresDatabaseAuthorization:true;requiresDurableAudit:true}>;
