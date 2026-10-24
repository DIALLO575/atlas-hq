export class CredentialLifecycleError extends Error {
  readonly code:string; constructor(code:string);
}
export type CredentialScope={workspaceId:string;instanceId:string};
export type CredentialVerifiedGrant={verified:true;actorId:string;workspaceId:string;instanceId:string;action:"create"|"rotate"|"revoke"|"inspect"};
export interface CredentialTransaction {
  insertCredential(record:Record<string,unknown>):Promise<void>;
  replaceCredential(scope:CredentialScope,before:Record<string,unknown>,after:Record<string,unknown>):Promise<void>;
  getCredential(scope:CredentialScope):Promise<Record<string,unknown>|null>;
  revokeCredential(scope:CredentialScope):Promise<boolean>;
  audit(event:Record<string,unknown>):Promise<void>;
}
export function createEngineCredentialLifecycle(deps:{
  verifySession(input:{session:unknown;workspaceId:string;instanceId:string;action:string}):Promise<CredentialVerifiedGrant>;
  loadVault(input:CredentialScope):Promise<{
    activeKeyId:string;
    encrypt:(input:Record<string,unknown>,secret:Buffer)=>unknown;
    decrypt:(input:Record<string,unknown>,envelope:unknown)=>Buffer;
    rotate:(input:Record<string,unknown>,envelope:unknown)=>any;
  }>;
  repository:{transaction<T>(fn:(tx:CredentialTransaction)=>Promise<T>):Promise<T>};
}):Readonly<{
  create(input:{scope:CredentialScope;session:unknown;secret:Buffer}):Promise<{created:true;keyId:string;version:number}>;
  rotate(input:{scope:CredentialScope;session:unknown}):Promise<{rotated:true;keyId:string;version:number}>;
  revoke(input:{scope:CredentialScope;session:unknown}):Promise<{revoked:true}>;
  inspect(input:{scope:CredentialScope;session:unknown}):Promise<{exists:true;revoked:boolean;keyId:string;version:number}>;
}>;
