# SHA-150 — Engine human approvals, preconnection contract

Status: **offline implementation only**. The workflow is not connected to
the current Supabase private schema or to an HTTP route. No MAUSBOT action
was executed. Tests are pure Node mocks of a trusted PostgreSQL transaction.

## Implemented in this change

- \`packages/engine-core/src/approval-workflow.mjs\`, types, and 10 mock tests.
- \`request\`: verified active session (must be checked again against
  \`auth.sessions\` under the trusted database transaction), current workspace
  membership, ownership of the actual run, expected state draft, 15-minute
  expiry, immutable intent digest, and append-only audit.
- \`decide\`: reviewer is a current owner/admin **different** from requester;
  active session, pending-only transition, nonexpired request, same run,
  instance, mission, primitive, and payload digest; optimistic lock / CAS
  and audit share the same database transaction. \`approved\` does NOT
  authorize engine dispatch.
- \`inspect\`: only the requester or workspace admin sees decision,
  intent digest and expiry. No prompts, raw action arguments or PII.
- Input strictly forbids caller-supplied \`approved:true\` shortcuts,
  role grants, fake requester identities or extra controls. Provider
  errors are masked and no transaction writes persist if the audit fails.

## Intent binding and database gap

The SHA-256 intent hash is derived from a canonical LF-separated tuple:

\`[ATLAS approval v1, workspace_id, instance_id, run_id, mission_id,
primitive_id, payload_sha256]\`.

The requester identity is tracked separately in the approval record, and
the DB trigger already rejects self-approval. The payload fingerprint
must come from the **trusted immutable run**; a client-provided digest is
not sufficient.

**The deployed database does NOT have \`payload_sha256\` on
\`public.atlas_engine_runs\`, nor \`intent_digest\` on
\`private.atlas_engine_approvals\`.** This is a deliberate hard blocker
for connecting this workflow to a real session or database. The next
reviewed additive migration must introduce immutable intent-binding
columns and DB-level checks before production wiring.

## Required before SHA-150 Done

1. New schema is applied and tested on disposable PostgreSQL; now test
   it under real Supabase Auth sessions and simultaneous reviewers.
2. Implement a trusted private SQL adapter: \`SELECT ... FOR UPDATE\` or
   equivalent CAS on run/approval, and COMMIT/ROLLBACK of audit in one
   transaction. Do not expose private tables to PostgREST.
3. Use \`supabase.auth.getUser()\` to establish identity, and at sensitive
   decision time check \`session_id\` against the live \`auth.sessions\`
   row, then re-read current \`workspace_members\` role, in the same
   trusted transaction. A JWT that remains valid after logout is not
   enough. Supabase guidance:
   https://supabase.com/docs/guides/auth/sessions .
4. Build a reviewer Inbox UI, a safe same-origin POST+CSRF flow, explicit
   scopes and audit receipts. Test two workspaces, concurrent reviewers,
   expired tokens, deactivated sessions, duplicate requests and races.
5. SHA-151 worker must recheck approved intent and policy at dispatch.
   No approval alone may activate a disabled engine or bypass HTTP 423.

Already applied migrations \`20261024161305\` and \`20261024163943\`
remain unchanged. No new migration applied by this PR.
