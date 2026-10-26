export function journalEtag(payload: unknown, userId: string, workspaceId: string): string;
export function journalEtagMatches(header: string | null | undefined, etag: string): boolean;
