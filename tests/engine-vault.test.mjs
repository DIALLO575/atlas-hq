import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import {
  EngineVaultError, createEngineVault, engineEnvelopeToRow, engineEnvelopeFromRow,
  engineEnvelopeToOutboxRow, engineEnvelopeFromOutboxRow,
} from "../packages/engine-core/src/vault.mjs";

const workspaceId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const otherWorkspace = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const instanceId = "aaaaaaaa-0000-4000-8000-000000000001";
const otherInstance = "bbbbbbbb-0000-4000-8000-000000000002";
const creds = { workspaceId, instanceId, purpose: "credential" };
const payload = { workspaceId, instanceId, purpose: "outbox" };
const root1 = randomBytes(32).toString("base64");
const root2 = randomBytes(32).toString("base64");
const original = createEngineVault({ keys: { "key-v1": root1 }, activeKeyId: "key-v1" });

test("AES-256-GCM encrypts token and authenticates tenant and instance context", () => {
  const secret = "private-do-not-log-credential-" + randomBytes(8).toString("hex");
  const envelope = original.encrypt(creds, secret);
  assert.equal(envelope.version, 1);
  assert.equal(envelope.keyId, "key-v1");
  assert.equal(envelope.nonce.length, 12);
  assert.equal(envelope.tag.length, 16);
  assert.equal(envelope.ciphertext.length, Buffer.byteLength(secret));
  assert.equal(envelope.ciphertext.includes(Buffer.from(secret)), false);
  assert.equal(original.decrypt(creds, envelope).toString("utf8"), secret);
  assert.equal(JSON.stringify(original).includes(root1), false);
  assert.equal(Object.keys(original).includes("keys"), false);
});

test("Random nonces prevent identical ciphertext, and encrypted outbox bodies are bounded", () => {
  const body = Buffer.from(JSON.stringify({ primitive: "agents.list", botId: "internal" }));
  const one = original.encrypt(payload, body);
  const two = original.encrypt(payload, body);
  assert.notDeepEqual(one.nonce, two.nonce);
  assert.notDeepEqual(one.ciphertext, two.ciphertext);
  assert.deepEqual(original.decrypt(payload, one), body);
  assert.throws(() => original.encrypt(payload, Buffer.alloc(1048577)), EngineVaultError);
  assert.throws(() => original.encrypt(creds, Buffer.alloc(65537)), EngineVaultError);
  assert.doesNotThrow(() => original.encrypt(payload, Buffer.alloc(1048576, 0x41)));
  assert.doesNotThrow(() => original.encrypt(creds, Buffer.alloc(65536, 0x41)));
  assert.throws(() => original.encrypt(creds, ""), EngineVaultError);
});

test("Cross-tenant, cross-instance and cross-purpose decryption always fails", () => {
  const envelope = original.encrypt(creds, "SENSITIVE");
  const invalid = [
    { ...creds, workspaceId: otherWorkspace },
    { ...creds, instanceId: otherInstance },
    { ...creds, purpose: "outbox" },
    { ...creds, workspaceId: workspaceId + "bad" },
  ];
  for (const context of invalid) {
    assert.throws(() => original.decrypt(context, envelope), EngineVaultError);
  }
});

test("Tampering with authenticated bytes fails closed with a constant error code", () => {
  const envelope = original.encrypt(creds, "private-value");
  for (const field of ["ciphertext", "nonce", "tag"]) {
    const mutated = { ...envelope, [field]: Buffer.from(envelope[field]) };
    mutated[field][0] ^= 0x01;
    assert.throws(
      () => original.decrypt(creds, mutated),
      e => e instanceof EngineVaultError && e.code === "VAULT_AUTHENTICATION_FAILED",
    );
  }
});

test("Canonical hex bytea serialization preserves ciphertext exactly", () => {
  const envelope = original.encrypt(creds, "private-value");
  const row = engineEnvelopeToRow(envelope);
  assert.deepEqual(Object.keys(row).sort(), ["ciphertext", "key_id", "nonce", "tag", "version"]);
  for (const field of ["nonce", "ciphertext", "tag"]) {
    assert.match(row[field], /^\\x[a-f0-9]+$/);
  }
  assert.deepEqual(engineEnvelopeFromRow(row), envelope);
  assert.equal(original.decrypt(creds, engineEnvelopeFromRow(row)).toString(), "private-value");
  assert.equal(JSON.stringify(row).includes("private-value"), false);
  assert.throws(() => engineEnvelopeFromRow({ ...row, nonce: "not-hex" }), EngineVaultError);
  assert.throws(() => engineEnvelopeFromRow({ ...row, version: 2 }), EngineVaultError);
});

test("Key rotation retains old reads only while the previous master key exists", () => {
  const oldCipher = original.encrypt(creds, "token-before-rotation");
  const rotated = createEngineVault({
    keys: { "key-v1": root1, "key-v2": root2 }, activeKeyId: "key-v2",
  });
  const rotatedCipher = rotated.rotate(creds, oldCipher);
  assert.equal(rotatedCipher.keyId, "key-v2");
  assert.equal(rotated.decrypt(creds, oldCipher).toString(), "token-before-rotation");
  assert.equal(rotated.decrypt(creds, rotatedCipher).toString(), "token-before-rotation");
  const pruned = createEngineVault({ keys: { "key-v2": root2 }, activeKeyId: "key-v2" });
  assert.equal(pruned.decrypt(creds, rotatedCipher).toString(), "token-before-rotation");
  assert.throws(() => pruned.decrypt(creds, oldCipher), EngineVaultError);
  assert.throws(() => original.decrypt(creds, rotatedCipher), EngineVaultError);
});

test("Invalid master keys, keyring, context and arbitrary envelope types are rejected", () => {
  for (const bad of [
    { keys: { v1: "fake key" }, activeKeyId: "v1" },
    { keys: {}, activeKeyId: "v1" },
    { keys: { v1: root1 }, activeKeyId: "v2" },
    { keys: { "../bad": root1 }, activeKeyId: "../bad" },
    { keys: { v1: root1.slice(0, 8) }, activeKeyId: "v1" },
  ]) assert.throws(() => createEngineVault(bad), EngineVaultError);
  for (const bad of [
    { ...creds, token: "untrusted" },
    { ...creds, purpose: "arbitrary" },
    { ...creds, instanceId: "invalid" },
  ]) assert.throws(() => original.encrypt(bad, "hello"), EngineVaultError);
  assert.throws(() => original.decrypt(creds, { version: 1, keyId: "key-v1" }), EngineVaultError);
  assert.throws(() => engineEnvelopeToRow({ ...original.encrypt(creds, "x"), tag: Buffer.alloc(2) }), EngineVaultError);
});

test("Outbox schema mapping includes key provenance and authenticates its payload", () => {
  const envelope = original.encrypt(payload, "{\"message\":\"never public\"}");
  const row = engineEnvelopeToOutboxRow(envelope);
  assert.deepEqual(Object.keys(row).sort(), [
    "key_id", "payload_ciphertext", "payload_nonce", "payload_tag", "version",
  ]);
  assert.equal(row.key_id, "key-v1");
  const recovered = engineEnvelopeFromOutboxRow(row);
  assert.deepEqual(recovered, envelope);
  assert.equal(original.decrypt(payload, recovered).toString("utf8"),
    "{\"message\":\"never public\"}");
  assert.equal(JSON.stringify(row).includes("never public"), false);
  assert.throws(() => engineEnvelopeFromOutboxRow({ ...row, version: 100 }),
    EngineVaultError);
});
