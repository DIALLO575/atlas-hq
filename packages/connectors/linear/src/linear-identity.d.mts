export function verifyLinearOAuthIdentity(accessToken: string, fetchImpl?: typeof fetch): Promise<{
  userId: string; workspaceId: string;
}>;
