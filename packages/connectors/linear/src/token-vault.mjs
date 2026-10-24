import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const KEY_ID = /^[A-Za-z0-9._-]{1,48}$/;
const TOKEN_TYPES = new Set(["access", "refresh"]);

export class LinearTokenVaultError extends Error {
  constructor(code = "LINEAR_TOKEN_VAULT_UNAVAILABLE") {
    super(code);
    this.name = "LinearTokenVaultError";
    this.code = code;
  }
}

function aadFor(binding, tokenType, keyId) {
  if (!binding || !UUID.test(binding.atlasWorkspaceId) || !UUID.test(binding.actorUserId) ||
      !UUID.test(binding.linearWorkspaceId) || !UUID.test(binding.linearActorId) || !TOKEN_TYPES.has(tokenType)) {
    throw new LinearTokenVaultError("LINEAR_TOKEN_BINDING_INVALID");
  }
  return Buffer.from(JSON.stringify([
    "atlas-linear-oauth", 1, binding.atlasWorkspaceId, binding.actorUserId,
    binding.linearWorkspaceId, binding.linearActorId, tokenType, keyId,
  ]));
}

function encode(buffer) {
  return buffer.toString("base64url");
}

function decode(value, expectedBytes) {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new LinearTokenVaultError("LINEAR_TOKEN_CIPHERTEXT_INVALID");
  }
  const decoded = Buffer.from(value, "base64url");
  if (encode(decoded) !== value || (expectedBytes !== undefined && decoded.length !== expectedBytes)) {
    throw new LinearTokenVaultError("LINEAR_TOKEN_CIPHERTEXT_INVALID");
  }
  return decoded;
}

export function createLinearTokenVault({ keys, currentKeyId }) {
  if (!keys || typeof keys !== "object" || Array.isArray(keys) || !KEY_ID.test(currentKeyId)) {
    throw new LinearTokenVaultError();
  }
  const keyring = new Map();
  for (const [keyId, encoded] of Object.entries(keys)) {
    if (!KEY_ID.test(keyId) || typeof encoded !== "string" ||
        !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) throw new LinearTokenVaultError();
    const key = Buffer.from(encoded, "base64");
    if (key.length !== 32 || key.toString("base64") !== encoded) throw new LinearTokenVaultError();
    keyring.set(keyId, key);
  }
  if (!keyring.has(currentKeyId)) throw new LinearTokenVaultError();

  function encryptToken(value, binding, tokenType) {
    if (typeof value !== "string" || value.length < 1 || value.length > 16_384) {
      throw new LinearTokenVaultError("LINEAR_TOKEN_INVALID");
    }
    const nonce = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", keyring.get(currentKeyId), nonce, { authTagLength: 16 });
    cipher.setAAD(aadFor(binding, tokenType, currentKeyId));
    const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
    return {
      keyId: currentKeyId,
      nonce: encode(nonce),
      ciphertext: encode(ciphertext),
      tag: encode(cipher.getAuthTag()),
    };
  }

  function decryptToken(record, binding, tokenType) {
    const keyId = record?.keyId;
    const key = keyring.get(keyId);
    if (!key) throw new LinearTokenVaultError("LINEAR_TOKEN_KEY_UNAVAILABLE");
    try {
      const decipher = createDecipheriv("aes-256-gcm", key, decode(record.nonce, 12), { authTagLength: 16 });
      decipher.setAAD(aadFor(binding, tokenType, keyId));
      decipher.setAuthTag(decode(record.tag, 16));
      return Buffer.concat([decipher.update(decode(record.ciphertext)), decipher.final()]).toString("utf8");
    } catch {
      throw new LinearTokenVaultError("LINEAR_TOKEN_AUTHENTICATION_FAILED");
    }
  }

  return Object.freeze({
    currentKeyId,
    encryptTokens({ accessToken, refreshToken }, binding) {
      const access = encryptToken(accessToken, binding, "access");
      const refresh = encryptToken(refreshToken, binding, "refresh");
      return {
        token_key_id: currentKeyId,
        access_nonce: access.nonce,
        access_ciphertext: access.ciphertext,
        access_tag: access.tag,
        refresh_nonce: refresh.nonce,
        refresh_ciphertext: refresh.ciphertext,
        refresh_tag: refresh.tag,
      };
    },
    decryptTokens(record, binding) {
      return {
        accessToken: decryptToken({ keyId: record.token_key_id, nonce: record.access_nonce,
          ciphertext: record.access_ciphertext, tag: record.access_tag }, binding, "access"),
        refreshToken: decryptToken({ keyId: record.token_key_id, nonce: record.refresh_nonce,
          ciphertext: record.refresh_ciphertext, tag: record.refresh_tag }, binding, "refresh"),
      };
    },
  });
}

export function linearTokenVaultFromEnvironment(env = process.env) {
  const currentKeyId = env.LINEAR_OAUTH_TOKEN_KEY_ID;
  const rawKeyring = env.LINEAR_OAUTH_TOKEN_KEYS;
  if (!currentKeyId || !rawKeyring) throw new LinearTokenVaultError();
  let keys;
  try { keys = JSON.parse(rawKeyring); } catch { throw new LinearTokenVaultError(); }
  return createLinearTokenVault({ keys, currentKeyId });
}
