import { inspect } from "node:util";
import { ATLAS_WORKSPACE_ID } from "../../../engine-core/src/catalog.mjs";

export class MausbotServerSecretError extends Error {
  constructor() {
    super("MAUSBOT_SERVER_SECRET_INVALID");
    this.name = "MausbotServerSecretError";
    this.code = "MAUSBOT_SERVER_SECRET_INVALID";
    this.status = 503;
  }
}

/** A bearer credential must be a bounded, printable, whitespace-free string. */
export function validMausbotServerToken(token) {
  return typeof token === "string" && /^[\x21-\x7e]{1,4096}$/.test(token);
}

/** Redacts accidental JSON/string/console projections; explicit token access is server-only. */
export function serverSecretRecord(metadata, token) {
  const result = { ...metadata };
  Object.defineProperties(result, {
    token: { value: token, enumerable: false },
    toJSON: { value: () => ({ ...metadata }), enumerable: false },
    [inspect.custom]: { value: () => ({ ...metadata, token: "[REDACTED]" }), enumerable: false },
  });
  return Object.freeze(result);
}

/**
 * Simple v1: one server environment credential bound to one workspace/instance.
 * No KMS, database, network, cache, activation, authorization or dispatch.
 * Resolve again before use; replacement/removal takes effect in the running env.
 * Existing copies cannot be revoked by this module: revoke the upstream token too.
 */
export function readMausbotServerSecret(env, scope) {
  if (typeof window !== "undefined") throw new MausbotServerSecretError();
  const { workspaceId, instanceId } = scope ?? {};
  if (typeof workspaceId !== "string" || !ATLAS_WORKSPACE_ID.test(workspaceId) ||
      typeof instanceId !== "string" || !ATLAS_WORKSPACE_ID.test(instanceId)) return null;
  if (!env || env.ATLAS_MAUSBOT_WORKSPACE_ID !== workspaceId ||
      env.ATLAS_MAUSBOT_INSTANCE_ID !== instanceId) return null;
  if (env.ATLAS_MAUSBOT_TOKEN_REVOKED === "true") return null;
  if (env.ATLAS_MAUSBOT_TOKEN_REVOKED !== undefined &&
      env.ATLAS_MAUSBOT_TOKEN_REVOKED !== "false") throw new MausbotServerSecretError();
  const token = env.ATLAS_MAUSBOT_TOKEN;
  if (token === undefined || token === "") return null;
  if (!validMausbotServerToken(token) ||
      typeof env.ATLAS_MAUSBOT_TOKEN_VERSION !== "string" ||
      !/^[A-Za-z0-9._-]{1,64}$/.test(env.ATLAS_MAUSBOT_TOKEN_VERSION)) {
    throw new MausbotServerSecretError();
  }
  return serverSecretRecord({
    source: "server-env", workspaceId, instanceId,
    version: env.ATLAS_MAUSBOT_TOKEN_VERSION, canDispatch: false,
  }, token);
}
