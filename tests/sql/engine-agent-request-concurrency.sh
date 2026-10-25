#!/usr/bin/env bash
# Disposable fixture only, after engine-agent-request-checks.sql.
set -euo pipefail
case "${PGHOST:-}" in 127.0.0.1|localhost) ;; *) echo 'Local disposable PostgreSQL required' >&2; exit 1;; esac
[[ "${ATLAS_ENGINE_DISPOSABLE_TEST:-}" == 1 ]] || exit 1
columns="$(psql -X -qAt -v ON_ERROR_STOP=1 -c "select count(*) from pg_catalog.pg_attribute where attrelid='auth.users'::regclass and attnum>0 and not attisdropped")"
[[ "$columns" == 1 ]] || exit 1
workdir="$(mktemp -d)"
trap 'rm -rf "$workdir"' EXIT
query="set role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
select set_config('request.jwt.claims','{\"session_id\":\"aaaacccc-0000-4000-8000-000000000001\"}',false);
select created::text || ':' || can_dispatch::text from public.atlas_engine_request_agent(
'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','aaaaaaaa-0000-4000-8000-000000000001',
'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','eeee1111-0000-4000-8000-000000000004','CONCURRENT','','');"
psql -X -qAt -v ON_ERROR_STOP=1 -c "$query" >"$workdir/a" 2>&1 &
a=$!
psql -X -qAt -v ON_ERROR_STOP=1 -c "$query" >"$workdir/b" 2>&1 &
b=$!
wait "$a"
wait "$b"
created=0; replay=0
for result in "$workdir/a" "$workdir/b"; do
 if grep -Fxq 'true:false' "$result"; then created=$((created+1));
 elif grep -Fxq 'false:false' "$result"; then replay=$((replay+1));
 else cat "$result"; exit 1;fi
done
[[ "$created" == 1 && "$replay" == 1 ]] || exit 1
count="$(psql -X -qAt -v ON_ERROR_STOP=1 -c "select count(*) from private.atlas_engine_audit_events where run_id='eeee1111-0000-4000-8000-000000000004' and event_key='engine.approval.requested'")"
[[ "$count" == 1 ]] || exit 1
count="$(psql -X -qAt -v ON_ERROR_STOP=1 -c "select count(*) from private.atlas_engine_outbox where run_id='eeee1111-0000-4000-8000-000000000004'")"
[[ "$count" == 0 ]] || exit 1
echo 'Concurrent agent requests: one run, one pending request, one audit, zero outbox.'
