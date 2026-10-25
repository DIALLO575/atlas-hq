export type MausbotSecretScope = { workspaceId: string; instanceId: string };
export type MausbotServerSecret = Readonly<MausbotSecretScope & {
  source: "server-env"; version: string; canDispatch: false; token: string;
}>;
export class MausbotServerSecretError extends Error {
  readonly code: "MAUSBOT_SERVER_SECRET_INVALID";
  readonly status: 503;
}
export function validMausbotServerToken(token: unknown): token is string;
export function serverSecretRecord<T extends object>(metadata: T, token: string): Readonly<T & { token: string }>;
export function readMausbotServerSecret(env: NodeJS.ProcessEnv, scope: MausbotSecretScope): MausbotServerSecret | null;
