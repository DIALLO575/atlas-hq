export type MausbotReleaseState=Readonly<{stage:"offline"|"read-only";readsEnabled:boolean;mutationsEnabled:false;pending:"durable-engine-gate"}>;
export function mausbotReleaseState(env:NodeJS.ProcessEnv):MausbotReleaseState;
export function mausbotReleasePermission(env:NodeJS.ProcessEnv,mode:"read"|"write"|"execute" | string):{allowed:true;status:200}|{allowed:false;code:string;status:number};
