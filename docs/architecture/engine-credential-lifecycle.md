# ATLAS — SHA-149, credential lifecycle offline

Code: \`packages/engine-core/src/credential-lifecycle.mjs\`.
Tests: \`tests/engine-credential-lifecycle.test.mjs\`.

## Delivered in this change

A server-only **dependency-injected** credential lifecycle contract with four
operations: \`create\`, \`rotate\`, \`revoke\`, \`inspect\`.

The lifecycle deliberately implements **no HTTP route, no SQL connection,
no KMS SDK, no MAUSBOT connection and no real credential mutation**.

It requires these trusted dependencies from a future reviewed server worker:

1. \`verifySession({ session, workspaceId, instanceId, action })\`
   independently verifies the real server-side actor session, membership,
   ownership and per-operation permission against current database state.
   The caller cannot supply \`approved:true\` in place of this callback.
2. \`loadVault({ workspaceId, instanceId })\` returns the previously tested
   AES-256-GCM vault initialized by a trusted external key provider. Old
   keys must remain readable during rotation; public \`NEXT_PUBLIC_*\`
   variables are never an acceptable key source.
3. \`repository.transaction(callback)\` must implement a *real PostgreSQL
   transaction* over the existing private credentials and audit tables.
   The callback's \`insertCredential\`, \`getCredential\`, \`replaceCredential\`
   (compare-and-swap), \`revokeCredential\` and \`audit\` operations must
   use parameterized SQL and run atomically. If an audit write fails,
   the entire credential mutation must roll back.

All records are scope-bound to **both workspace_id and instance_id** and
contain only ciphertext/nonce/tag/key_id/version and revoked_at.
The API returns only success and key metadata. Revoked credentials cannot
be rotated. The previously implemented AES-256-GCM envelope authenticates
the workspace, instance, purpose, key ID and version.

Offline tests use a fake transactional repository and key provider to check
credential creation, duplicate rejection, rotation, revoked records, wrong
workspace/instance data, denied sessions, audit rollback and CAS failures.

## What still blocks SHA-149 completion

- Choose and configure a real KMS/secret provider, lifecycle, rotation policy,
  and revocation plan. Nothing is yet connected or configured here.
- Build an actual **private PostgreSQL adapter** (the Supabase private schema
  stays unexposed to PostgREST) with least-privilege connection identity and
  parametrized SQL, verified transactions and CAS.
- Implement a real authenticated-session + current workspace/instance grant
  verifier, including revocation, audit and cross-tenant tests under real
  Supabase Auth. The fake verifier in tests is **NOT** authorization.
- Implement an approved worker-only controlled credential use flow which
  never returns plaintext to a browser or to a logging layer.
- Run DB/KMS staging tests and a security review before any engine is enabled.

**Runtime remains preconnection.** The MAUSBOT write/execute API still blocks
operations with HTTP 423. No new Supabase migrations are required for these
offline interfaces; versions \`20261024161305\` and \`20261024163943\`
are already applied and must not be rerun.
