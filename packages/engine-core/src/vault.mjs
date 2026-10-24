import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

/**
 * SHA-132: server-only, transport-free vault. This module NEVER reads env vars,
 * opens network connections or writes database rows. A trusted server process
 * must supply a secret keyring from a non-NEXT_PUBLIC_ configuration.
 *
 * The ciphertext authenticates the exact workspace, engine instance, purpose,
 * key version and key ID. Ciphertext copied across tenants or instances fails.
 */
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const KEY_ID = /^[a-zA-Z0-9._-]{1,64}$/;
const PURPOSES = Object.freeze({ credential: 65536, outbox: 1048576 });
const SALT = Buffer.from("atlas-hq/engine-vault/v1/hkdf-sha256", "utf8");
const NONCE_LENGTH = 12;
const TAG_LENGTH = 16;
const VERSION = 1;

export class EngineVaultError extends Error {
  constructor(code) {
    super(code);
    this.name = "EngineVaultError";
    this.code = code;
  }
}
function fail(code) { throw new EngineVaultError(code); }
const plain = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
function context(input) {
  if (!plain(input) || Object.keys(input).some(
      key => !["workspaceId", "instanceId", "purpose"].includes(key)) ||
      !UUID.test(input.workspaceId ?? "") || !UUID.test(input.instanceId ?? "") ||
      !Object.hasOwn(PURPOSES, input.purpose)) fail("VAULT_CONTEXT_INVALID");
  return Object.freeze({
    workspaceId: input.workspaceId.toLowerCase(),
    instanceId: input.instanceId.toLowerCase(),
    purpose: input.purpose,
  });
}
function masterKey(value) {
  if (typeof value !== "string" || !/^[A-Za-z0-9+/]{43}=$/.test(value))
    fail("VAULT_KEY_INVALID");
  const bytes = Buffer.from(value, "base64");
  if (bytes.length !== 32 || bytes.toString("base64") !== value)
    fail("VAULT_KEY_INVALID");
  return bytes;
}
function envelopeBytes(x, length, max = length) {
  if (!Buffer.isBuffer(x) || x.length < length || x.length > max)
    fail("VAULT_ENVELOPE_INVALID");
  return x;
}
function meta(c, keyId) {
  // Canonical, unambiguous context. Do not change without a new version.
  return Buffer.from(JSON.stringify(["ATLAS", "engine", VERSION, c.workspaceId,
    c.instanceId, c.purpose, keyId]), "utf8");
}
function subkey(root, additionalData) {
  return Buffer.from(hkdfSync("sha256", root, SALT, additionalData, 32));
}
function validateEnvelope(raw, c, keyExists) {
  if (!plain(raw) || Object.keys(raw).some(
     key => !["version", "keyId", "nonce", "ciphertext", "tag"].includes(key)) ||
     raw.version !== VERSION || !KEY_ID.test(raw.keyId ?? "") || !keyExists(raw.keyId))
    fail("VAULT_ENVELOPE_INVALID");
  const nonce = envelopeBytes(raw.nonce, NONCE_LENGTH);
  const tag = envelopeBytes(raw.tag, TAG_LENGTH);
  const ciphertext = envelopeBytes(raw.ciphertext, 1, PURPOSES[c.purpose]);
  return { nonce, tag, ciphertext };
}
function bytea(value) {
  if (!Buffer.isBuffer(value)) fail("VAULT_ENVELOPE_INVALID");
  return "\\x" + value.toString("hex");
}

/** Encode bytea fields for parameterized PostgreSQL inserts. No JSON plaintext. */
export function engineEnvelopeToRow(envelope) {
  if (!plain(envelope) || envelope.version !== VERSION ||
      !KEY_ID.test(envelope.keyId ?? "") ||
      !Buffer.isBuffer(envelope.nonce) || envelope.nonce.length !== NONCE_LENGTH ||
      !Buffer.isBuffer(envelope.tag) || envelope.tag.length !== TAG_LENGTH ||
      !Buffer.isBuffer(envelope.ciphertext) || envelope.ciphertext.length < 1 ||
      envelope.ciphertext.length > PURPOSES.outbox) fail("VAULT_ENVELOPE_INVALID");
  return Object.freeze({ key_id: envelope.keyId, version: VERSION,
    nonce: bytea(envelope.nonce), ciphertext: bytea(envelope.ciphertext),
    tag: bytea(envelope.tag) });
}

/** Decode trusted PG bytea fields; never accept general URLs or base64 blobs. */
export function engineEnvelopeFromRow(row) {
  if (!plain(row) || row.version !== VERSION ||
      !KEY_ID.test(row.key_id ?? "")) fail("VAULT_ENVELOPE_INVALID");
  const decode = (hex, exact) => {
    if (typeof hex !== "string" || !/^\\x(?:[a-fA-F0-9]{2})+$/.test(hex))
      fail("VAULT_ENVELOPE_INVALID");
    const b = Buffer.from(hex.slice(2), "hex");
    if (exact !== undefined && b.length !== exact) fail("VAULT_ENVELOPE_INVALID");
    return b;
  };
  const obj = {
    keyId: row.key_id, version: VERSION,
    nonce: decode(row.nonce, NONCE_LENGTH),
    ciphertext: decode(row.ciphertext),
    tag: decode(row.tag, TAG_LENGTH),
  };
  if (obj.ciphertext.length > PURPOSES.outbox) fail("VAULT_ENVELOPE_INVALID");
  return Object.freeze(obj);
}

/**
 * Keys: { "key-v1": "<canonical 32-byte base64>", ... }.
 * Return value contains ONLY functions and an active key id, never root keys.
 * Retain previous keys during rotation; deleting an old key is irreversible.
 */
export function createEngineVault({ keys, activeKeyId }) {
  if (!plain(keys) || !KEY_ID.test(activeKeyId ?? "") ||
      Object.keys(keys).length < 1 || Object.keys(keys).length > 8)
    fail("VAULT_KEYRING_INVALID");
  const roots = new Map();
  for (const [keyId, value] of Object.entries(keys)) {
    if (!KEY_ID.test(keyId)) fail("VAULT_KEYRING_INVALID");
    roots.set(keyId, masterKey(value));
  }
  if (!roots.has(activeKeyId)) fail("VAULT_KEYRING_INVALID");

  function encrypt(input, plaintext) {
    const c = context(input);
    const limit = PURPOSES[c.purpose];
    if ((!Buffer.isBuffer(plaintext) && typeof plaintext !== "string"))
      fail("VAULT_PLAINTEXT_INVALID");
    const raw = Buffer.isBuffer(plaintext) ? plaintext : Buffer.from(plaintext, "utf8");
    if (raw.length < 1 || raw.length > limit) fail("VAULT_PLAINTEXT_INVALID");
    const metadata = meta(c, activeKeyId);
    const key = subkey(roots.get(activeKeyId), metadata);
    const nonce = randomBytes(NONCE_LENGTH);
    try {
      const cipher = createCipheriv("aes-256-gcm", key, nonce, { authTagLength: TAG_LENGTH });
      cipher.setAAD(metadata, { plaintextLength: raw.length });
      const ciphertext = Buffer.concat([cipher.update(raw), cipher.final()]);
      return Object.freeze({ version: VERSION, keyId: activeKeyId, nonce,
        ciphertext, tag: cipher.getAuthTag() });
    } finally {
      key.fill(0);
    }
  }

  function decrypt(input, envelope) {
    const c = context(input);
    const v = validateEnvelope(envelope, c, keyId => roots.has(keyId));
    const metadata = meta(c, envelope.keyId);
    const key = subkey(roots.get(envelope.keyId), metadata);
    try {
      const decipher = createDecipheriv("aes-256-gcm", key, v.nonce,
        { authTagLength: TAG_LENGTH });
      decipher.setAAD(metadata, { plaintextLength: v.ciphertext.length });
      decipher.setAuthTag(v.tag);
      return Buffer.concat([decipher.update(v.ciphertext), decipher.final()]);
    } catch {
      fail("VAULT_AUTHENTICATION_FAILED");
    } finally {
      key.fill(0);
    }
  }

  /** Old encrypted records are decrypted only inside the trusted worker. */
  function rotate(input, envelope) {
    const clear = decrypt(input, envelope);
    try {
      return encrypt(input, clear);
    } finally {
      clear.fill(0);
    }
  }

  return Object.freeze({ activeKeyId, encrypt, decrypt, rotate });
}
