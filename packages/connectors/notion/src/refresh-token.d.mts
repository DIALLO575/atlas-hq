export class NotionRefreshError extends Error { code: string; }
export function refreshNotionOAuthToken(args: {
  clientId: string; clientSecret: string; refreshToken: string;
  notionWorkspaceId: string; notionBotId: string;
  request?: typeof fetch; timeoutMs?: number;
}): Promise<{ accessToken: string; refreshToken: string }>;
