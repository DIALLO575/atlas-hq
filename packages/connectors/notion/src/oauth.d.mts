export const NOTION_OAUTH_CALLBACK_PATH: string;
export class NotionOAuthError extends Error { code: string; }
export function buildNotionAuthorizationUrl(args: {
  clientId: string; redirectUri: string; publicOrigin: string; state: string;
}): string;
export function exchangeNotionAuthorizationCode(args: {
  clientId: string; clientSecret: string; code: string; redirectUri: string;
  publicOrigin: string; request?: typeof fetch; timeoutMs?: number;
}): Promise<{ accessToken: string; refreshToken: string | null;
  notionWorkspaceId: string; notionBotId: string; workspaceName: string | null }>;
export function revokeNotionOAuthToken(args: {
  clientId: string; clientSecret: string; token: string;
  request?: typeof fetch; timeoutMs?: number;
}): Promise<true>;
