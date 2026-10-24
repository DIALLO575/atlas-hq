#!/usr/bin/env bash
set -euo pipefail

run_tag="linear-oauth-refresh-${GITHUB_RUN_ID:-local}-$$"
first_output="/tmp/${run_tag}-first.out"
second_output="/tmp/${run_tag}-second.out"
trap 'rm -f "$first_output" "$second_output"' EXIT

workspace="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
user="11111111-1111-4111-8111-111111111111"
linear_workspace="cccccccc-cccc-4ccc-8ccc-cccccccccccc"
linear_actor="dddddddd-dddd-4ddd-8ddd-dddddddddddd"

setup_sql="select public.atlas_linear_save_connection(
  '$workspace', '$user', '$linear_workspace', '$linear_actor',
  'test-v3', 'MDAwMDAwMDAwMDAy', 'Y2lwaGVydGV4dFJlY29ubmVjdA', 'AAAAAAAAAAAAAAAAAAAAAA',
  'MDAwMDAwMDAwMDAz', 'cmVmcmVzaGNpcGhlclJlY29ubmVjdA', 'AAAAAAAAAAAAAAAAAAAAAA',
  array['read']::text[], now() + interval '20 seconds', 3);"
setup_version="$(psql -X -qAt -v ON_ERROR_STOP=1 -c "$setup_sql")"
if [[ "$setup_version" != "4" ]]; then
  echo "Expected reactivation at version 4; got $setup_version" >&2
  exit 1
fi

claim_sql() {
  local attempt="$1"
  printf "BEGIN; select public.atlas_linear_claim_refresh('%s','%s',4,'%s'); select pg_sleep(2); COMMIT;\n" \
    "$workspace" "$user" "$attempt"
}

claim_sql '11111111-aaaa-4111-8111-111111111111' | psql -X -qAt -v ON_ERROR_STOP=1 > "$first_output" &
first_pid=$!
sleep 0.2
claim_sql '22222222-bbbb-4222-8222-222222222222' | psql -X -qAt -v ON_ERROR_STOP=1 > "$second_output" &
second_pid=$!
wait "$first_pid"
wait "$second_pid"

winners="$(awk 'NF && $1 == "t" { total++ } END { print total + 0 }' "$first_output" "$second_output")"
if [[ "$winners" != "1" ]]; then
  cat "$first_output" "$second_output"
  echo "Expected one durable refresh claimant across two PostgreSQL sessions; got $winners" >&2
  exit 1
fi

winner="$(psql -X -qAt -v ON_ERROR_STOP=1 -c "select refresh_attempt_id from public.atlas_linear_connections where workspace_id='$workspace' and user_id='$user';")"
finish_sql="select public.atlas_linear_complete_refresh(
  '$workspace', '$user', 4, '$winner', 'test-v4',
  'MDAwMDAwMDAwMDA0', 'Y2lwaGVydGV4dFJlZnJlc2hlZA', 'AAAAAAAAAAAAAAAAAAAAAA',
  'MDAwMDAwMDAwMDA1', 'cmVmcmVzaGNpcGhlclJlZnJlc2hlZA', 'AAAAAAAAAAAAAAAAAAAAAA',
  array['read']::text[], now() + interval '1 day');"
finished_version="$(psql -X -qAt -v ON_ERROR_STOP=1 -c "$finish_sql")"
if [[ "$finished_version" != "5" ]]; then
  echo "Expected the winning refresh to store one new encrypted pair at version 5; got $finished_version" >&2
  exit 1
fi

# Verify ordinary versioned key/reconnect writes also have one winner after refresh.
save_sql="BEGIN; select public.atlas_linear_save_connection(
  '$workspace', '$user', '$linear_workspace', '$linear_actor',
  'test-v5', 'MDAwMDAwMDAwMDA2', 'Y2lwaGVydGV4dEtleVJvdGF0ZWQ', 'AAAAAAAAAAAAAAAAAAAAAA',
  'MDAwMDAwMDAwMDA3', 'cmVmcmVzaGNpcGhlcktleVJvdGF0ZWQ', 'AAAAAAAAAAAAAAAAAAAAAA',
  array['read']::text[], now() + interval '1 day', 5
); select pg_sleep(2); COMMIT;"
printf '%s\n' "$save_sql" | psql -X -qAt -v ON_ERROR_STOP=1 > "$first_output" &
first_pid=$!
sleep 0.2
printf '%s\n' "$save_sql" | psql -X -qAt -v ON_ERROR_STOP=1 > "$second_output" &
second_pid=$!
wait "$first_pid"
wait "$second_pid"

winners="$(awk 'NF && $1 == "6" { total++ } END { print total + 0 }' "$first_output" "$second_output")"
if [[ "$winners" != "1" ]]; then
  cat "$first_output" "$second_output"
  echo "Expected one version-checked connection update; got $winners" >&2
  exit 1
fi

final_state="$(psql -X -qAt -v ON_ERROR_STOP=1 -c "select version || ':' || (refresh_attempt_id is null)::text || ':' || (revoked_at is null)::text from public.atlas_linear_connections where workspace_id='$workspace' and user_id='$user';")"
if [[ "$final_state" != "6:true:true" ]]; then
  echo "Expected active version 6 with no refresh gate; got $final_state" >&2
  exit 1
fi

printf 'PostgreSQL refresh gate passed: one cross-session refresh claimant; version 5 saved; CAS update had one winner; final state %s.\n' "$final_state"
