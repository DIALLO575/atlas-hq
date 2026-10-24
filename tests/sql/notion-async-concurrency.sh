#!/usr/bin/env bash
set -euo pipefail
# Two separate PG sessions claim distinct leases without a shared Node process.
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
sql="set role service_role; select job_id from public.atlas_notion_claim_async_task(90);"
psql -X -v ON_ERROR_STOP=1 -At -c "$sql" > "$tmp/a" &
a=$!
psql -X -v ON_ERROR_STOP=1 -At -c "$sql" > "$tmp/b" &
b=$!
wait "$a"
wait "$b"
first=$(tail -n1 "$tmp/a" | tr -d '[:space:]')
second=$(tail -n1 "$tmp/b" | tr -d '[:space:]')
[[ "$first" =~ ^[0-9a-f-]{36}$ && "$second" =~ ^[0-9a-f-]{36}$ ]] || {
  echo 'unexpected async job claim format'; exit 1;
}
[[ "$first" != "$second" ]] || {
  echo 'same async job claimed by two workers'; exit 1;
}
count=$(psql -X -v ON_ERROR_STOP=1 -At -c \
"select count(*) from public.atlas_notion_async_jobs where status='leased' and
connection_id='123e4567-e89b-12d3-a456-426614174042'")
[[ "$count" = 2 ]] || { echo "missing async leases: $count"; exit 1; }
echo "Concurrent async task claim: two unique, durable leases."
