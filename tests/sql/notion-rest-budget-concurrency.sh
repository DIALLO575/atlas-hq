#!/usr/bin/env bash
set -euo pipefail
# Two independent PSQL processes test persisted admission under contention.
# Runs only in the CI disposable PostgreSQL service.
conn="123e4567-e89b-12d3-a456-426614174030"
ws="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
actor="11111111-1111-4111-8111-111111111111"
nws="eeeeeeee-eeee-4eee-8eee-eeeeeeeeee30"
sql="set role service_role; select (public.atlas_notion_reserve_rest_read('$conn','$ws','$actor','$nws',1,3000)->>'delay_ms')::integer;"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
psql -X -v ON_ERROR_STOP=1 -At -c "$sql" > "$tmp/first" &
first=$!
psql -X -v ON_ERROR_STOP=1 -At -c "$sql" > "$tmp/second" &
second=$!
wait "$first"
wait "$second"
a=$(tail -n1 "$tmp/first" | tr -d '[:space:]')
b=$(tail -n1 "$tmp/second" | tr -d '[:space:]')
[[ "$a" =~ ^[0-9]+$ ]] && [[ "$b" =~ ^[0-9]+$ ]] || {
  echo 'invalid cross-session reservation'; exit 1;
}
total=$(psql -X -v ON_ERROR_STOP=1 -At -c \
  "select reserved_count from public.atlas_notion_rest_budgets where scope_type='workspace' and scope_id='$nws'")
[[ "$total" = 2 ]] || { echo "lost admission across PostgreSQL sessions: $total"; exit 1; }
echo "Two-process durable Notion admission passed: reserved=$total."
