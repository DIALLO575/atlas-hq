export type NotionTokenBinding = {
  atlasWorkspaceId: string; actorUserId: string; notionWorkspaceId: string;
  notionBotId: string;
};
export type NotionEncryptedTokens = {
  token_key_id: string;
  access_nonce: string; access_ciphertext: string; access_tag: string;
  refresh_nonce: string | null; refresh_ciphertext: string | null; refresh_tag: string | null;
};
export class NotionTokenVaultError extends Error { code: string; }
export function createNotionTokenVault(args: {
  keys: Record<string, string>; currentKeyId: string;
}): {
  currentKeyId: string;
  encryptTokens(tokens: { accessToken: string; refreshToken?: string | null },
    binding: NotionTokenBinding): NotionEncryptedTokens;
  decryptTokens(row: NotionEncryptedTokens, binding: NotionTokenBinding):
    { accessToken: string; refreshToken: string | null };
};
export function notionTokenVaultFromEnvironment(env?: NodeJS.ProcessEnv):
  ReturnType<typeof createNotionTokenVault>;
