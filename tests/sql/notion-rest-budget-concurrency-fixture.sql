-- Cross-process race fixture after the SQL test above, only disposable DB.
set role service_role;
select public.atlas_notion_store_connection(
  '123e4567-e89b-12d3-a456-426614174030',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  '11111111-1111-4111-8111-111111111111',
  'eeeeeeee-eeee-4eee-8eee-eeeeeeeeee30',
  'dddddddd-dddd-4ddd-8ddd-dddddddddd30',
  'Budget concurrency','testkey','MDAwMDAwMDAwMDAw','Y2lwaGVydGV4dA',
  'AAAAAAAAAAAAAAAAAAAAAA',
  'MDAwMDAwMDAwMDAx','cmVmcmVzaGNpcGhlcg','AAAAAAAAAAAAAAAAAAAAAA');
reset role;
