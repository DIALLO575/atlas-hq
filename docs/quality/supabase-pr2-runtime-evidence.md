# Supabase PR #2 runtime evidence

## Scope and timestamp

- Evidence captured: 2026-10-23 09:42 UTC (post-run catalog/advisor checks observed at 09:42:27–09:42:28 UTC).
- PR: [#2](https://github.com/DIALLO575/atlas-hq/pull/2), branch `feat/auth-workspace-supabase`.
- Git head at test time: `2daf7476c7fc285448e85b03f42378346aeabb43`.
- Database target: disposable project `atlas-pr2-rls-test-20261023`, ref `jnhzhsqdfaoetwnzpokc`, region `eu-west-1`, status `ACTIVE_HEALTHY`.
- The official project `ovzmmsxqfifneqqgnrzd` was not queried or modified in this run.

## Exact migration mapping

The disposable project's `supabase_migrations.schema_migrations` table has a `statements` array. For each row below, its single stored statement was compared byte-for-byte with the corresponding SQL file at PR head `2daf747`; all comparisons were exact (`true`). This resolves the timestamp difference: the temporary database uses its own migration versions, while retaining the repository SQL text.

| Temporary version/name | PR file | Exact text | SHA-256 | Git blob SHA-1 |
| --- | --- | --- | --- | --- |
| `20261023092845` / `pr2_auth_workspaces_rls` | `supabase/migrations/20261023071054_auth_workspaces_rls.sql` | yes; 1 statement, 4,901 bytes | `428b269106839dc3491f7f2dac49ad0ccf7fc73a41ab937de1f49a7cfd65a428` | `f3dc02ba1accd676d91fe1b2c785cb771583983a` |
| `20261023092846` / `pr2_fail_closed_rls_auto_enable` | `supabase/migrations/20261023072200_fail_closed_rls_auto_enable.sql` | yes; 1 statement, 1,584 bytes | `b6b87aae1f083e02deb4a6b43e8c5b0164ebc1d8d612007c11018bd3d68f9b41` | `821f3ac1c499207f98dd58a26e50b034faf94082` |
| `20261023092847` / `pr2_limit_workspace_update_columns` | `supabase/migrations/20261023073700_limit_workspace_update_columns.sql` | yes; 1 statement, 278 bytes | `c757b5971e2461a2eff89a660e3bc3943da730af79e492fa5af74b5e93488ba9` | `dec0fec9116deb5acce565a055a40711ef239018` |

There is also a preceding temporary-only history row `20261023092844 / pr2_baseline_rls_auto_enable`; it is not one of the three PR migrations above. The project migration history, function and trigger catalog were read-only inspected.

## Runtime SQL test

The exact `supabase/tests/workspace_rls.sql` file at PR head was sent to Supabase `execute_sql` on project `jnhzhsqdfaoetwnzpokc`. The script opens a transaction and ends with `ROLLBACK`; no migration or persistent fixture write was run. SHA-256: `37ff276e0e6c127425fc3091a5859b8305a13243822570f50f5601ce73055ffa`; Git blob SHA-1: `ce5ff55f3bfa2bcacd32d6f9ab50c663369be5b8`. The GitHub file content at the tested branch head matched the local test file exactly.

The SQL uses `RAISE EXCEPTION` for every failed assertion. The execute call returned `isError: false` and reached the final User B claim setup; no assertion exception was returned. Therefore each listed assertion completed without failure:

| Test group | Runtime assertion result |
| --- | --- |
| User A | sees only workspace A and its membership; can update `name` and `updated_at`; cannot update `created_by`; updating allowed fields preserves `created_by`; forged `created_by` on workspace creation is denied |
| Owner membership writes | can nominate another admin in workspace A; cannot grant `owner`; cannot write membership to workspace B |
| User C as workspace admin | can nominate another admin in A; cannot grant `owner`; cannot write to B; still sees only A |
| User B | sees only workspace B and its membership, not A |
| Privilege catalog | `name` and `updated_at` UPDATE allowed; `created_by` and table-level UPDATE denied; no other workspace column has UPDATE privilege |
| Fail-closed event trigger | `ensure_rls` is attached to `CREATE TABLE`; active function has no `WHEN OTHERS` swallow path; injected failure aborts table creation and leaves no partial table; a normal new public table receives RLS |

The SQL tool exposes only the final row of a multi-statement request, not individual PL/pgSQL `DO` notices. Its returned row was the expected `set_config` for User B. A separate read-only post-run query returned: fixture users/workspaces/memberships remaining `0`; both probe tables absent; RLS enabled on both workspace tables; allowed/denied column grants as expected; active fail-closed function and event-trigger tag present. This also confirms the test transaction rolled back its fixtures and probe tables.

## Advisors

- Security advisor: zero lints.
- Performance advisor: one INFO, `unindexed_foreign_keys` for `public.workspaces.workspaces_created_by_fkey` (`created_by`); no other finding returned.

## Method and limits

- Read-only calls: project identity, migration history, table metadata, migration statements, post-test catalog, and security/performance advisors.
- Test call: exact SQL file via Supabase MCP `execute_sql` against the disposable project only.
- No Supabase CLI, `psql`, Dashboard editor or project migration API was used. No statement targeted the official project.
- Runtime proof is for the disposable project and tested Git head only. The MCP response does not preserve a per-assertion transcript; results above are supported by the script's exception-based assertions, successful execution response, and post-run catalog query.
