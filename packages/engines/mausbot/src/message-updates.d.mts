export type MausbotMessage = {id: string | null; at: string | null; role: string | null; kind: string | null; text: string; [key:string]:unknown};
export declare const MAUSBOT_MESSAGE_WINDOW: number;
export declare const MAUSBOT_MESSAGE_CACHE_LIMIT: number;
export declare const MAUSBOT_THREAD_CACHE_LIMIT: number;
export declare const MAUSBOT_THREAD_CACHE_TTL_MS: number;
export declare function mausbotMessageDelta(messages:MausbotMessage[],afterId:string|null):{reset:boolean;messages:MausbotMessage[]};
export declare function mergeMausbotMessages<T extends MausbotMessage>(current:T[],incoming:T[],reset?:boolean):T[];
export declare function lastMausbotMessageId(messages:MausbotMessage[]):string|null;
export declare function rememberMausbotThread<T>(cache:Map<string,{messages:T[];updatedAt:number}>,key:string,messages:T[],now?:number):T[];
