#!/usr/bin/env bash
set -euo pipefail
operation="$(psql -X -qAt -v ON_ERROR_STOP=1 -c "select id from public.atlas_github_studio_operations where repository_name='race-fixture';")"
if [[ ! "$operation" =~ ^[0-9a-f-]{36}$ ]]; then echo "No test operation" >&2; exit 1; fi
tag="gh-studio-${GITHUB_RUN_ID:-local}-$$"
a="/tmp/${tag}-a"; b="/tmp/${tag}-b"
trap 'rm -f "$a" "$b"' EXIT
query="set role service_role; select public.atlas_gh_studio_advance('$operation'::uuid,'prepared','dispatching');"
psql -X -qAt -v ON_ERROR_STOP=1 -c "$query" >"$a" 2>&1 &
ap=$!
psql -X -qAt -v ON_ERROR_STOP=1 -c "$query" >"$b" 2>&1 &
bp=$!
set +e
wait "$ap"; ac=$?
wait "$bp"; bc=$?
set -e
if [[ "$ac:$bc" != "0:3" && "$ac:$bc" != "3:0" ]]; then
  cat "$a" "$b"; echo "Expected exactly one CAS winner" >&2; exit 1
fi
if [[ "$(psql -X -qAt -v ON_ERROR_STOP=1 -c "select count(*) from public.atlas_github_studio_audit where operation_id='$operation'::uuid and state='dispatching';")" != "1" ]]; then
  echo "Expected exactly one dispatch audit event" >&2; exit 1
fi
echo "Single dispatch + atomic audit verified under concurrent sessions."
