-- Source-only two-session SKIP LOCKED verification fixture.
set role service_role;
select public.atlas_notion_store_connection(
'123e4567-e89b-12d3-a456-426614174042',
'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
'11111111-1111-4111-8111-111111111111',
'eeeeeeee-eeee-4eee-8eee-eeeeeeeeee42',
'dddddddd-dddd-4ddd-8ddd-dddddddddd42',
'async contention','testkey','MDAwMDAwMDAwMDAw','Y2lwaGVydGV4dA',
'AAAAAAAAAAAAAAAAAAAAAA','MDAwMDAwMDAwMDAx','cmVmcmVzaGNpcGhlcg','AAAAAAAAAAAAAAAAAAAAAA');
select public.atlas_notion_enqueue_async_task(
'123e4567-e89b-12d3-a456-426614174042',
'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
'11111111-1111-4111-8111-111111111111',
'eeeeeeee-eeee-4eee-8eee-eeeeeeeeee42',1,'task_first');
select public.atlas_notion_enqueue_async_task(
'123e4567-e89b-12d3-a456-426614174042',
'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
'11111111-1111-4111-8111-111111111111',
'eeeeeeee-eeee-4eee-8eee-eeeeeeeeee42',1,'task_second');
reset role;
