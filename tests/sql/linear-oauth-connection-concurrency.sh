#!/usr/bin/env bash
set -euo pipefail

run_tag="linear-oauth-connection-${GITHUB_RUN_ID:-local}-$$"
first_output="/tmp/${run_tag}-first.out"
second_output="/tmp/${run_tag}-second.out"
trap 'rm -f "$first_output" "$second_output"' EXIT

save_sql="BEGIN; select public.atlas_linear_save_connection(
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111',
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  'test-v2', 'MDAwMDAwMDAwMDAy', 'Y2lwaGVydGV4dFJvdGF0ZWQ', 'AAAAAAAAAAAAAAAAAAAAAA',
  'MDAwMDAwMDAwMDAz', 'cmVmcmVzaGNpcGhlclJvdGF0ZWQ', 'AAAAAAAAAAAAAAAAAAAAAA',
  array['read']::text[], now() + interval '1 day', 2
); select pg_sleep(2); COMMIT;"

psql -X -qAt -v ON_ERROR_STOP=1 -c "$save_sql" > "$first_output" &
first_pid=$!
sleep 0.2
psql -X -qAt -v ON_ERROR_STOP=1 -c "$save_sql" > "$second_output" &
second_pid=$!
wait "$first_pid"
wait "$second_pid"

winners="$(awk 'NF && $1 == "3" { total++ } END { print total + 0 }' "$first_output" "$second_output")"
if [[ "$winners" != "1" ]]; then
  cat "$first_output" "$second_output"
  echo "Expected one version-checked connection rotation; got $winners" >&2
  exit 1
fi

final_version="$(psql -X -qAt -v ON_ERROR_STOP=1 -c "select version from public.atlas_linear_connections where workspace_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and user_id = '11111111-1111-4111-8111-111111111111';")"
if [[ "$final_version" != "3" ]]; then
  echo "Expected exactly one rotation to version 3; got $final_version" >&2
  exit 1
fi

printf 'PostgreSQL connection CAS passed: one concurrent rotation winner; final version 3.\n'
