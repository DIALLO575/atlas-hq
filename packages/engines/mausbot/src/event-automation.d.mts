export const EVENT_AUTOMATION_READS:readonly string[];
export const EVENT_AUTOMATION_PLANS:readonly string[];
export class EventAutomationContractError extends Error { readonly code:string;readonly status:number;constructor(code:string); }
export function planEventAutomationRead(name:string,input?:Record<string,unknown>):Readonly<Record<string,unknown>>;
export function executeEventAutomationRead(config:{baseUrl:string;token:string},name:string,
 input?:Record<string,unknown>,deps?:{fetchImpl?:typeof fetch}):Promise<Record<string,unknown>>;
export function planEventAutomationMutation(name:string,input?:Record<string,unknown>):Readonly<Record<string,unknown>>;
export function planMausbotEventReplay(cursor?:string|null):Readonly<Record<string,unknown>>;
export function reconcileMausbotEvent(state:Record<string,unknown>,event:Record<string,unknown>):Readonly<Record<string,unknown>>;
