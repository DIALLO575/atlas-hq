export class EngineApprovalError extends Error { readonly code:string;constructor(code:string); }
export type EngineApprovalScope={workspaceId:string;instanceId:string;runId:string};
export type EngineApprovalSession={verified:true;actorId:string;sessionId:string};
export type EngineApprovalDecision="approved"|"rejected";
export function engineApprovalIntentDigest(run:Record<string,unknown>):string;
export interface EngineApprovalTx {
  sessionActive(actorId:string,sessionId:string):Promise<boolean>;
  workspaceRole(workspaceId:string,actorId:string):Promise<"owner"|"admin"|"member"|null>;
  getRunForUpdate(scope:EngineApprovalScope):Promise<Record<string,unknown>|null>;
  getApprovalForUpdate(scope:EngineApprovalScope):Promise<Record<string,unknown>|null>;
  insertPending(row:Record<string,unknown>):Promise<void>;
  decidePending(row:Record<string,unknown>):Promise<boolean>;
  audit(row:Record<string,unknown>):Promise<void>;
}
export function createEngineApprovalWorkflow(input:{
  authenticate(session:unknown):Promise<EngineApprovalSession>;
  repository:{transaction<T>(fn:(tx:EngineApprovalTx)=>Promise<T>):Promise<T>};
  now?:()=>number;
}):Readonly<{
  request(input:{scope:EngineApprovalScope;session:unknown}):Promise<{state:"pending";intentDigest:string;expiresAt:string;canDispatch:false}>;
  decide(input:{scope:EngineApprovalScope;session:unknown;decision:EngineApprovalDecision;expectedIntentDigest:string}):Promise<{decision:EngineApprovalDecision;intentDigest:string;canDispatch:false}>;
  inspect(input:{scope:EngineApprovalScope;session:unknown}):Promise<{decision:string;intentDigest:string;expiresAt:string;canDispatch:false}>;
}>;
