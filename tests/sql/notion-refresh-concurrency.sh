#!/usr/bin/env bash
set -euo pipefail
id="123e4567-e89b-12d3-a456-426614174009"
workspace="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
actor="11111111-1111-4111-8111-111111111111"
psql -X -qAt -v ON_ERROR_STOP=1 -c "set role service_role; select public.atlas_notion_store_connection('$id','$workspace','$actor','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','ffffffff-ffff-4fff-8fff-ffffffffffff','Concurrency','testkey','MDAwMDAwMDAwMDAw','Y2lwaGVydGV4dA','AAAAAAAAAAAAAAAAAAAAAA','MDAwMDAwMDAwMDAx','cmVmcmVzaGNpcGhlcg','AAAAAAAAAAAAAAAAAAAAAA');" >/dev/null
a="/tmp/notion-refresh-$$-a"; b="/tmp/notion-refresh-$$-b"
trap 'rm -f "$a" "$b"' EXIT
claim() {
 printf "set role service_role; begin; select public.atlas_notion_claim_refresh('%s','%s','%s',1,'%s'); select pg_sleep(2); commit;\n" "$id" "$workspace" "$actor" "$1"
}
claim "11111111-aaaa-4111-8111-111111111111" | psql -X -qAt -v ON_ERROR_STOP=1 > "$a" &
first=$!
sleep 0.2
claim "22222222-bbbb-4222-8222-222222222222" | psql -X -qAt -v ON_ERROR_STOP=1 > "$b" &
second=$!
wait "$first"
wait "$second"
winners="$(awk '$1=="t"{sum++}END{print sum+0}' "$a" "$b")"
if [[ "$winners" != "1" ]]; then cat "$a" "$b"; echo "Expected one claimant" >&2; exit 1; fi
attempt="$(psql -X -qAt -v ON_ERROR_STOP=1 -c "select refresh_attempt_id from public.atlas_notion_connections where connection_id='$id';")"
version="$(psql -X -qAt -v ON_ERROR_STOP=1 -c "set role service_role; select public.atlas_notion_complete_refresh('$id','$workspace','$actor',1,'$attempt','testkey','MDAwMDAwMDAwMDAw','YQ','AAAAAAAAAAAAAAAAAAAAAA','MDAwMDAwMDAwMDAx','Yg','AAAAAAAAAAAAAAAAAAAAAA');")"
if [[ "$version" != "2" ]]; then echo "Completion version: $version" >&2; exit 1; fi
state="$(psql -X -qAt -v ON_ERROR_STOP=1 -c "select version || ':' || (refresh_attempt_id is null)::text from public.atlas_notion_connections where connection_id='$id';")"
if [[ "$state" != "2:true" ]]; then echo "Bad state $state" >&2; exit 1; fi
echo "Notion concurrent refresh passed: one winning claimant, one complete pair"
