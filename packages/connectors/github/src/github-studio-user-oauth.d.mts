export declare const studioOAuthAttemptCookie: string;
export declare const studioOAuthGrantCookie: string;
export declare function createStudioOAuthAttempt(args: {
 workspaceId: string; actorId: string; installationId: number; state: string;
 key: string; now?: number;
}): { cookie: string; challenge: string };
export declare function readStudioOAuthAttempt(args: {
 cookie?: string; state?: string; key: string; now?: number;
}): null | { workspaceId: string; actorId: string; installationId: number; verifier: string };
export declare function githubStudioAuthorizeUrl(args: {
 clientId: string; redirectUri: string; state: string; challenge: string;
}): URL;
export declare function exchangeStudioOAuthCode(args: {
 code: string; verifier: string; clientId: string; clientSecret: string;
 redirectUri: string; request?: typeof fetch;
}): Promise<{ accessToken: string; lifetimeSeconds: number }>;
export declare function verifyStudioOAuthAccount(args: {
 accessToken: string; installationId: number; request?: typeof fetch;
}): Promise<{ userId: number; login: string }>;
export declare function sealStudioUserGrant(args: {
 accessToken: string; githubUserId: number; githubLogin: string;
 workspaceId: string; actorId: string; installationId: number;
 key: string; lifetimeSeconds: number; now?: number;
}): string;
export declare function readStudioUserGrant(args: {
 cookie?: string; workspaceId: string; actorId: string;
 installationId: number; key: string; now?: number;
}): null | { accessToken: string; githubUserId: number; githubLogin: string };
