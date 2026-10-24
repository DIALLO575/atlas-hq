import type { EncryptedLinearTokens, LinearTokenBinding } from "./token-vault.mjs";
export function saveLinearConnection(admin: unknown, args: {
  actor: { workspaceId: string; userId: string };
  linearIdentity: { workspaceId: string; userId: string };
  tokens: { accessToken: string; refreshToken: string };
  scopes: string[]; expiresAt: string; expectedVersion?: number | null;
  vault: { currentKeyId: string; encryptTokens(tokens: { accessToken: string; refreshToken: string }, binding: LinearTokenBinding): EncryptedLinearTokens };
}): Promise<{ version: number }>;
export function loadLinearConnectionForActor(args: {
  session: unknown; admin: unknown; workspaceId: string; vault: {
    decryptTokens(record: EncryptedLinearTokens, binding: LinearTokenBinding): { accessToken: string; refreshToken: string };
  } | null; allowExpired?: boolean; includeRevoked?: boolean;
}): Promise<null | { accessToken: string; refreshToken: string; actorUserId: string; linearWorkspaceId: string; linearActorId: string;
  scopes: string[]; accessExpiresAt: string; version: number; revokedAt: string | null;
  refreshAttemptId: string | null; refreshStartedAt: string | null }>;
export function claimLinearConnectionRefresh(admin: unknown, args: {
  workspaceId: string; userId: string; expectedVersion: number; attemptId: string;
}): Promise<boolean>;
export function completeLinearConnectionRefresh(admin: unknown, args: {
  workspaceId: string; userId: string; expectedVersion: number; attemptId: string;
  connection: { linearWorkspaceId: string; linearActorId: string };
  tokens: { accessToken: string; refreshToken: string }; scopes: string[]; expiresAt: string;
  vault: { encryptTokens(tokens: { accessToken: string; refreshToken: string }, binding: LinearTokenBinding): EncryptedLinearTokens };
}): Promise<false | { version: number }>;
export function rejectLinearConnectionRefresh(admin: unknown, args: {
  workspaceId: string; userId: string; expectedVersion: number; attemptId: string;
}): Promise<boolean>;
export function invalidateUncertainLinearRefresh(admin: unknown, args: {
  workspaceId: string; userId: string; expectedVersion: number; attemptId: string;
}): Promise<boolean>;
export function revokeLinearConnection(admin: unknown, args: {
  workspaceId: string; userId: string; expectedVersion: number;
}): Promise<boolean>;

export function rotateLinearConnectionKey(admin: unknown, args: {
  workspaceId: string; userId: string; vault: { currentKeyId: string;
    encryptTokens(tokens: { accessToken: string; refreshToken: string }, binding: LinearTokenBinding): EncryptedLinearTokens;
    decryptTokens(record: EncryptedLinearTokens, binding: LinearTokenBinding): { accessToken: string; refreshToken: string };
  };
}): Promise<{ rotated: boolean; reason?: string; version?: number }>;
