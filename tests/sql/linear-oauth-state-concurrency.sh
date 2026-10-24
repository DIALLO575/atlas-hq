#!/usr/bin/env bash
set -euo pipefail

run_tag="linear-oauth-state-${GITHUB_RUN_ID:-local}-$$"
first_output="/tmp/${run_tag}-first.out"
second_output="/tmp/${run_tag}-second.out"
trap 'rm -f "$first_output" "$second_output"' EXIT

consume_sql="BEGIN; WITH consumed AS (
  UPDATE public.atlas_linear_oauth_states SET consumed_at = now()
  WHERE state_hash = repeat('c', 64)
    AND workspace_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    AND user_id = '11111111-1111-4111-8111-111111111111'
    AND consumed_at IS NULL AND expires_at > now()
  RETURNING 1
) SELECT count(*) FROM consumed; SELECT pg_sleep(2); COMMIT;"

psql -X -qAt -v ON_ERROR_STOP=1 -c "$consume_sql" > "$first_output" &
first_pid=$!
sleep 0.2
psql -X -qAt -v ON_ERROR_STOP=1 -c "$consume_sql" > "$second_output" &
second_pid=$!
wait "$first_pid"
wait "$second_pid"

winners="$(awk 'NF { total += $1; rows++ } END { if (rows != 2) exit 2; print total }' "$first_output" "$second_output")"
if [[ "$winners" != "1" ]]; then
  cat "$first_output" "$second_output"
  echo "Expected exactly one concurrent consumer; got $winners" >&2
  exit 1
fi

sleep 6
expired="$(psql -X -qAt -v ON_ERROR_STOP=1 -c "WITH consumed AS (
  UPDATE public.atlas_linear_oauth_states SET consumed_at = now()
  WHERE state_hash = repeat('e', 64) AND consumed_at IS NULL AND expires_at > now()
  RETURNING 1
) SELECT count(*) FROM consumed;")"
if [[ "$expired" != "0" ]]; then
  echo "Expired state was consumed: $expired" >&2
  exit 1
fi

printf 'PostgreSQL race passed: one winner; expired state rejected.\n'
