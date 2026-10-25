export type NotionMediaDescriptor = {
  kind: "image" | "pdf" | "video" | "audio" | "file";
  origin: "notion" | "external" | "upload" | "unavailable";
  mode: "proxy" | "link" | "unavailable";
  caption: string; filename: string; href: string | null;
};
export type NotionRichSegment = {
  text:string;kind:"text"|"mention"|"equation";href:string|null;
  bold:boolean;italic:boolean;underline:boolean;strikethrough:boolean;code:boolean;
};
export type NotionDocumentBlock = {
  id: string; type: string; text: string; media: NotionMediaDescriptor | null;
  segments: NotionRichSegment[]; tableHeaders: {column:boolean;row:boolean}|null;
  link: string | null; cells: string[]; language: string | null;
  checked: boolean | null; hasChildren: boolean;
  children: NotionDocumentBlock[]; childrenTruncated: boolean;
};
export function safeExternalUrl(value: unknown): string | null;
export function validNotionId(value: unknown): boolean;
export function safeNotionHostedUrl(value: unknown,expiry: unknown,now?: number): string | null;
export function projectNotionRichText(parts: unknown, length?: number): NotionRichSegment[];
export function projectNotionBlock(raw: unknown, args?: {now?: number}): NotionDocumentBlock | null;
export function collectNotionDocument(
  client: {listBlockChildren: (id: string, options: {size: number;signal?: AbortSignal;
    startCursor?:string|null})=>
    Promise<{results: unknown[];has_more: boolean;next_cursor?: string|null}>},
  pageId: string,
  options?: {maxDepth?: number;maxNodes?: number;maxRequests?: number;
    pageSize?:number;startCursor?:string|null;signal?:AbortSignal;now?:number}
): Promise<{blocks:NotionDocumentBlock[]; truncated: boolean;
  requests:number;nodes:number;hasMore:boolean;nextCursor:string|null}>;
