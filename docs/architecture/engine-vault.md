# SHA-132 — Engine vault: authenticated encryption

Implemented in packages/engine-core/src/vault.mjs using Node.js built-in crypto
(AES-256-GCM, random 96-bit nonce, 128-bit tag, HKDF-SHA256). No dependencies.

## Implemented

- createEngineVault receives a server-held keyring with canonical 32-byte
  base64 master keys; it never reads environment variables or returns roots.
- encrypt({workspaceId,instanceId,purpose}, plaintext) authenticates the
  exact workspace, engine instance, purpose (credential or outbox), key ID,
  and format version in the authenticated additional data.
- decrypt rejects swapped tenancy, engines or purposes, unknown keys, modified
  nonce/tag/ciphertext, or unsupported versions.
- rotate decrypts under a retained previous key then re-encrypts with the
  active key. Do not delete previous keys until all records are migrated.
- engineEnvelopeToRow / engineEnvelopeFromRow encode/decode PostgreSQL bytea
  as canonical hex; the stored row never contains plaintext.
- Credential size capped to 64 KiB; outbox size capped to 1 MiB. Derived
  cipher keys are zeroed after use where possible.

Tests use only ephemeral random keys and fake data: tamper rejection,
cross-tenant/instance/purpose protection, key rotation, size bounds and
bytea roundtrips.

## NOT yet operational — required next steps

1. Configure key lifecycle with a trusted KMS or secret provider.
   Never put keys in NEXT_PUBLIC_, Git, logs, sessions or localStorage.
2. SCHEMA GAP: private.atlas_engine_credentials has key_id and version;
   private.atlas_engine_outbox is missing both. Review an additive
   migration before storing any encrypted outbox payload.
3. Use a trusted worker with private SQL driver or narrow internal
   privileged API: private schema must remain UNEXPOSED to Supabase Data API.
4. Implement true actor-session verification, resource authorization,
   approvals, audit and lease fencing before any credential read/write.
5. Do not register this vault in any browser or public BFF routes.

Status: a cryptographic primitive tested offline, not a deployed secret
manager. No real MAUSBOT engine has been connected; writes remain hard-blocked.
