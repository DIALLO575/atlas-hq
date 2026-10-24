import type { NotionEncryptedTokens, NotionTokenBinding } from "./token-vault.mjs";
export function rotateNotionCredentials(args: {
  record: {
    connection_id: string; version: number; revoked_at: string | null;
    refresh_attempt_id: string | null;
    notion_workspace_id: string; notion_bot_id: string;
  };
  tokens: { accessToken: string; refreshToken: string | null };
  actor: { workspaceId: string; userId: string };
  vault: { encryptTokens(tokens: { accessToken: string; refreshToken: string },
    binding: NotionTokenBinding): NotionEncryptedTokens };
  clientId: string; clientSecret: string;
  store: {
    claim(args: { connectionId: string; workspaceId: string; userId: string;
      expectedVersion: number; attemptId: string }): Promise<boolean>;
    complete(args: { connectionId: string; workspaceId: string; userId: string;
      expectedVersion: number; attemptId: string;
      encrypted: NotionEncryptedTokens }): Promise<number | null>;
    fail(args: { connectionId: string; workspaceId: string; userId: string;
      expectedVersion: number; attemptId: string }): Promise<boolean>;
  };
  request?: typeof fetch; attemptId?: string;
}): Promise<{ accessToken: string; version: number }>;
