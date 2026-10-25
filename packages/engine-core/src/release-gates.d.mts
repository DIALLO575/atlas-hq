export type MausbotReleaseState=Readonly<{stage:"offline"|"read-only";readsEnabled:boolean;mutationsEnabled:false;pending:"durable-engine-gate"}>;
export function mausbotReleaseState(env:NodeJS.ProcessEnv):MausbotReleaseState;
export function mausbotReleasePermission(env:NodeJS.ProcessEnv,mode:"read"|"write"|"execute" | string):{allowed:true;status:200}|{allowed:false;code:string;status:number};

export type N8nReleaseState = Readonly<{
  stage: "offline"; providerReadsEnabled: false; mutationsEnabled: false;
  dispatchEnabled: false; pending: "n8n-durable-provider-certification";
}>;
export function n8nReleaseState(env?: NodeJS.ProcessEnv): N8nReleaseState;
export function n8nReleasePermission(env: NodeJS.ProcessEnv, mode: "read" | "write" | "execute" | string):
  Readonly<{ allowed: false; status: number; code: string }>;
