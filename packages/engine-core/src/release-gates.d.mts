export type MausbotReleaseState=Readonly<{stage:"offline"|"read-only"|"enabled";readsEnabled:boolean;mutationsEnabled:boolean}>;
export function mausbotReleaseState(env:NodeJS.ProcessEnv):MausbotReleaseState;
export function mausbotReleasePermission(env:NodeJS.ProcessEnv,mode:"read"|"write"|"execute" | string):{allowed:true;status:200}|{allowed:false;code:string;status:number};
