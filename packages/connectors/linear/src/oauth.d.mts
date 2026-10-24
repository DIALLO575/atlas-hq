export class LinearOAuthError extends Error { code: string; }
export function createLinearPkcePair(): { verifier: string; challenge: string };
export function linearAuthorizationUrl(args: {
  clientId: string; redirectUri: string; state: string; codeChallenge: string; scopes?: string[];
}): URL;
export function exchangeLinearAuthorizationCode(args: {
  code: string; clientId: string; clientSecret?: string; redirectUri: string; codeVerifier: string;
  fetchImpl?: typeof fetch;
}): Promise<{
  accessToken: string; refreshToken: string; expiresInSeconds: number; scopes: string[];
}>;
export function refreshLinearOAuthToken(args: {
  refreshToken: string; clientId: string; clientSecret?: string; fetchImpl?: typeof fetch;
}): Promise<{ accessToken: string; refreshToken: string; expiresInSeconds: number; scopes: string[] }>;

export function revokeLinearOAuthTokens(args: {
  accessToken: string; refreshToken: string; fetchImpl?: typeof fetch;
}): Promise<{ accessRevoked: boolean; refreshRevoked: boolean; allRevoked: boolean }>;
