export class EngineVaultError extends Error {
  readonly code: string;
  constructor(code: string);
}
export type EngineVaultContext = {
  workspaceId: string; instanceId: string; purpose: "credential" | "outbox";
};
export type EngineEnvelope = Readonly<{
  version: 1; keyId: string;
  nonce: Buffer; ciphertext: Buffer; tag: Buffer;
}>;
export function createEngineVault(input: {
  keys: Record<string, string>; activeKeyId: string;
}): Readonly<{
  activeKeyId: string;
  encrypt(context: EngineVaultContext, plaintext: Buffer | string): EngineEnvelope;
  decrypt(context: EngineVaultContext, envelope: EngineEnvelope): Buffer;
  rotate(context: EngineVaultContext, envelope: EngineEnvelope): EngineEnvelope;
}>;
export function engineEnvelopeToRow(envelope: EngineEnvelope): Readonly<{
  key_id: string; version: 1; nonce: string; ciphertext: string; tag: string;
}>;
export function engineEnvelopeFromRow(row: {
  key_id: string; version: number; nonce: string; ciphertext: string; tag: string;
}): EngineEnvelope;
export function engineEnvelopeToOutboxRow(envelope: EngineEnvelope): Readonly<{
  key_id: string; version: 1; payload_nonce: string; payload_ciphertext: string; payload_tag: string;
}>;
export function engineEnvelopeFromOutboxRow(row: {
  key_id: string; version: number; payload_nonce: string;
  payload_ciphertext: string; payload_tag: string;
}): EngineEnvelope;
