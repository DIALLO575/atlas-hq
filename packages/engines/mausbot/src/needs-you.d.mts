export type MausbotNeedsYouKind = "signed-out" | "usage-limit" | "out-of-credit" | "connection" | "place" | "question";
export type MausbotNeedsYouItem = {
  id:string;kind:MausbotNeedsYouKind;at:number;title:string;
  botIds:string[];threadId?:string;app?:string;text?:string;
};
export type MausbotNeedsYouResult = {
  source:"live-read-only";mode:"needs-you";canApprove:false;canDispatch:false;
  windowDays:number;items:MausbotNeedsYouItem[];
};
export const MAUSBOT_NEEDS_YOU_KINDS:readonly MausbotNeedsYouKind[];
export function normalizeMausbotNeedsYou(payload:unknown):MausbotNeedsYouResult;
export function readMausbotNeedsYou(
 config:{baseUrl:string;token:string},
 deps?:{fetchImpl?:typeof fetch;timeoutMs?:number},
):Promise<MausbotNeedsYouResult>;
