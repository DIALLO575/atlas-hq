# GitHub Studio — orchestration create/reconcile (SHA-155)

The provider's `createPersonalRepository` and the server database CAS can now be linked through `coordinateRepositoryCreation`, a pure server-side coordinator with injected database and GitHub collaborators.

The coordinator is **NOT wired to a Next.js execute route**. It cannot create real repositories from Atlas yet.

## Required behavior (tested with mocks)
- Existing `dispatching` or `reconciliation_required` operation never causes another provider POST.
- Competing server requests call GitHub only when the database CAS `prepared -> dispatching` succeeds exactly once.
- After provider response, persist `provider_confirmed` with numeric repo ID, then verify provider access separately.
- Only a single future `finishWithAccess` transaction can bind a **verified** repo ID into the tenant's allowlist and mark the operation succeeded.
- GitHub network timeout, invalid provider response, live grant missing or DB error yields `reconciliation_required`, never a fake success.
- A stalled operation is not silently retried.

## Important
The real finalization RPC, provider grant verification, authenticated execute endpoint, new GitHub App permissions and human confirmation still need to be implemented and separately reviewed. This coordinator alone is not authorization, a permission grant, or an idempotency persistence layer; the database migration `20261024225515_github_studio_operation_ledger.sql` supplies the latter once deliberately applied.

Associated Linear tickets: SHA-154 / SHA-155 / SHA-162.
