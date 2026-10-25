export class NotionMediaError extends Error {
  constructor(code: string);
  code: string;
}
export function notionHostedMediaSource(block: unknown, now?: number):
  Readonly<{url: string;kind:"image"|"pdf"|"audio"|"video"|"file"}>;
export function fetchNotionHostedMedia(source: {url:string;kind:string}, options?: {
  request?: typeof fetch;timeoutMs?:number;maxBytes?:number;
}): Promise<{bytes:Uint8Array; mime:string;disposition:"inline"|"attachment"}>;
