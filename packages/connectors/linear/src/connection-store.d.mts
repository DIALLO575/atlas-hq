import type { LinearTokenBinding } from "./token-vault.mjs";
export function saveLinearConnection(admin: unknown, args: {
  actor: { workspaceId: string; userId: string };
  linearIdentity: { workspaceId: string; userId: string };
  tokens: { accessToken: string; refreshToken: string };
  scopes: string[]; expiresAt: string; expectedVersion?: number | null;
  vault: { currentKeyId: string; encryptTokens(tokens: { accessToken: string; refreshToken: string }, binding: LinearTokenBinding): Record<string, string> };
}): Promise<{ version: number }>;
export function loadLinearConnectionForActor(args: {
  session: unknown; admin: unknown; workspaceId: string; vault: {
    decryptTokens(record: Record<string, unknown>, binding: LinearTokenBinding): { accessToken: string; refreshToken: string };
  } | null;
}): Promise<null | { accessToken: string; refreshToken: string; linearWorkspaceId: string; linearActorId: string; scopes: string[]; accessExpiresAt: string; version: number }>;
export function revokeLinearConnection(admin: unknown, args: {
  workspaceId: string; userId: string; expectedVersion: number;
}): Promise<boolean>;

export function rotateLinearConnectionKey(admin: unknown, args: {
  workspaceId: string; userId: string; vault: { currentKeyId: string;
    encryptTokens(tokens: { accessToken: string; refreshToken: string }, binding: LinearTokenBinding): Record<string, string>;
    decryptTokens(record: Record<string, unknown>, binding: LinearTokenBinding): { accessToken: string; refreshToken: string };
  };
}): Promise<{ rotated: boolean; reason?: string; version?: number }>;
