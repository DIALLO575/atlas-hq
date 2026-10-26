export const BOOK_FORMATS: Readonly<{epub:'application/epub+zip';pdf:'application/pdf'}>;
export const BOOK_FINISHED_THRESHOLD: number;
export function isBookUuid(value: unknown): value is string;
export function validateCreateBook(value: unknown): null | {workspaceId:string;title:string;author:string;format:'epub'|'pdf';mimeType:string;byteSize:number};
export function validateProgress(value: unknown): null | {workspaceId:string;sendId:string;events:Array<{bookId:string;deltaSeconds:number;position:number;clientUpdatedAt:string;pagesRead:number|null}>};
export function booksEtag(payload:unknown,userId:string,workspaceId:string):string;
export function etagMatches(header:string|null,etag:string):boolean;
