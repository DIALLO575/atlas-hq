import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/** AES-GCM envelopes are bound to the ATLAS actor and Notion REST identity. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KEY_ID = /^[A-Za-z0-9._-]{1,48}$/;
export class NotionTokenVaultError extends Error {
  constructor(code = "NOTION_TOKEN_VAULT_UNAVAILABLE") {
    super(code);
    this.name = "NotionTokenVaultError";
    this.code = code;
  }
}
function bindingAAD(binding, kind, keyId) {
  if (!binding || !["access", "refresh"].includes(kind) ||
      ![binding.atlasWorkspaceId, binding.actorUserId,
        binding.notionWorkspaceId, binding.notionBotId].every(id => UUID.test(id ?? ""))) {
    throw new NotionTokenVaultError("INVALID_BINDING");
  }
  return Buffer.from(JSON.stringify(["atlas-notion-rest-oauth", 1,
    binding.atlasWorkspaceId, binding.actorUserId,
    binding.notionWorkspaceId, binding.notionBotId, kind, keyId]));
}
function encode(value) { return value.toString("base64url"); }
function decode(value, bytes) {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new NotionTokenVaultError("INVALID_CIPHERTEXT");
  }
  const buffer = Buffer.from(value, "base64url");
  if (encode(buffer) !== value || (bytes !== undefined && buffer.length !== bytes)) {
    throw new NotionTokenVaultError("INVALID_CIPHERTEXT");
  }
  return buffer;
}
export function createNotionTokenVault({ keys, currentKeyId }) {
  if (!keys || typeof keys !== "object" || Array.isArray(keys) ||
      !KEY_ID.test(currentKeyId ?? "")) throw new NotionTokenVaultError();
  const keyring = new Map();
  for (const [id, value] of Object.entries(keys)) {
    if (!KEY_ID.test(id) || typeof value !== "string" ||
        !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) throw new NotionTokenVaultError();
    const key = Buffer.from(value, "base64");
    if (key.length !== 32 || key.toString("base64") !== value) throw new NotionTokenVaultError();
    keyring.set(id, key);
  }
  if (!keyring.has(currentKeyId)) throw new NotionTokenVaultError();
  function encrypt(value, binding, kind) {
    if (typeof value !== "string" || !value || value.length > 16384) {
      throw new NotionTokenVaultError("INVALID_TOKEN");
    }
    const nonce = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", keyring.get(currentKeyId), nonce);
    cipher.setAAD(bindingAAD(binding, kind, currentKeyId));
    const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
    return { nonce: encode(nonce), ciphertext: encode(encrypted), tag: encode(cipher.getAuthTag()) };
  }
  function decrypt(record, binding, kind) {
    const keyId = record?.keyId;
    const key = keyring.get(keyId);
    if (!key) throw new NotionTokenVaultError("KEY_UNAVAILABLE");
    try {
      const decipher = createDecipheriv("aes-256-gcm", key, decode(record.nonce, 12));
      decipher.setAAD(bindingAAD(binding, kind, keyId));
      decipher.setAuthTag(decode(record.tag, 16));
      return Buffer.concat([decipher.update(decode(record.ciphertext)), decipher.final()]).toString("utf8");
    } catch { throw new NotionTokenVaultError("AUTHENTICATION_FAILED"); }
  }
  return Object.freeze({
    currentKeyId,
    encryptTokens({ accessToken, refreshToken = null }, binding) {
      const access = encrypt(accessToken, binding, "access");
      const refresh = refreshToken == null ? null : encrypt(refreshToken, binding, "refresh");
      return {
        token_key_id: currentKeyId,
        access_nonce: access.nonce, access_ciphertext: access.ciphertext, access_tag: access.tag,
        refresh_nonce: refresh?.nonce ?? null,
        refresh_ciphertext: refresh?.ciphertext ?? null,
        refresh_tag: refresh?.tag ?? null,
      };
    },
    decryptTokens(record, binding) {
      const accessToken = decrypt({
        keyId: record?.token_key_id, nonce: record?.access_nonce,
        ciphertext: record?.access_ciphertext, tag: record?.access_tag,
      }, binding, "access");
      const allRefresh = [record?.refresh_nonce, record?.refresh_ciphertext, record?.refresh_tag];
      if (allRefresh.some(v => v != null) && !allRefresh.every(v => v != null)) {
        throw new NotionTokenVaultError("INVALID_CIPHERTEXT");
      }
      const refreshToken = allRefresh.every(v => v != null) ? decrypt({
        keyId: record.token_key_id, nonce: record.refresh_nonce,
        ciphertext: record.refresh_ciphertext, tag: record.refresh_tag,
      }, binding, "refresh") : null;
      return { accessToken, refreshToken };
    },
  });
}
export function notionTokenVaultFromEnvironment(env = process.env) {
  const keyId = env.NOTION_OAUTH_TOKEN_KEY_ID;
  let keys;
  try { keys = JSON.parse(env.NOTION_OAUTH_TOKEN_KEYS ?? ""); }
  catch { throw new NotionTokenVaultError(); }
  return createNotionTokenVault({ keys, currentKeyId: keyId });
}
