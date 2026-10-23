export class GitHubAuthorizationError extends Error {
  code: string;
  constructor(code: string);
}
export type GitHubProviderRequest = (url: string, init?: RequestInit) => Promise<Response>;
export function exchangeGitHubAppCode(input: {
  code: string; clientId: string; clientSecret: string; redirectUri: string;
  request?: GitHubProviderRequest;
}): Promise<string>;
export function verifyPersonalInstallation(input: {
  userToken: string; appId: string | number; installationId: number;
  request?: GitHubProviderRequest;
}): Promise<{ installationId: number; repositoryIds: number[]; accountLogin: string }>;
export function githubUserOAuthUrl(input: {
  clientId: string; redirectUri: string; state: string;
}): string;
