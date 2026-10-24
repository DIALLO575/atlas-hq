export class LinearTokenVaultError extends Error { code: string; }
export interface LinearTokenBinding {
  atlasWorkspaceId: string; actorUserId: string; linearWorkspaceId: string; linearActorId: string;
}
export interface EncryptedLinearTokens {
  token_key_id: string; access_nonce: string; access_ciphertext: string; access_tag: string;
  refresh_nonce: string; refresh_ciphertext: string; refresh_tag: string;
}
export function createLinearTokenVault(args: { keys: Record<string, string>; currentKeyId: string }): {
  currentKeyId: string;
  encryptTokens(tokens: { accessToken: string; refreshToken: string }, binding: LinearTokenBinding): EncryptedLinearTokens;
  decryptTokens(record: EncryptedLinearTokens, binding: LinearTokenBinding): { accessToken: string; refreshToken: string };
};
export function linearTokenVaultFromEnvironment(env?: NodeJS.ProcessEnv): ReturnType<typeof createLinearTokenVault>;
