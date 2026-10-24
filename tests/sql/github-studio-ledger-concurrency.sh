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
successes=0
rejections=0
for result in "$a" "$b"; do
  if grep -Eq '^dispatching
if [[ "$(psql -X -qAt -v ON_ERROR_STOP=1 -c "select count(*) from public.atlas_github_studio_audit where operation_id='$operation'::uuid and state='dispatching';")" != "1" ]]; then
  echo "Expected exactly one dispatch audit event" >&2; exit 1
fi
echo "Single dispatch + atomic audit verified under concurrent sessions."
 "$result"; then
    successes=$((successes+1))
  elif grep -q 'GH_STUDIO_INVALID_TRANSITION' "$result"; then
    rejections=$((rejections+1))
  else
    cat "$a" "$b"; echo "Unexpected PostgreSQL concurrency outcome" >&2; exit 1
  fi
done
if [[ "$successes" -ne 1 || "$rejections" -ne 1 ||
      ( "$ac" -eq 0 && "$bc" -eq 0 ) ]]; then
  cat "$a" "$b"; echo "Expected one CAS winner and one rejected request" >&2; exit 1
fi
if [[ "$(psql -X -qAt -v ON_ERROR_STOP=1 -c "select count(*) from public.atlas_github_studio_audit where operation_id='$operation'::uuid and state='dispatching';")" != "1" ]]; then
  echo "Expected exactly one dispatch audit event" >&2; exit 1
fi
echo "Single dispatch + atomic audit verified under concurrent sessions."
