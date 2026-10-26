-- B1 rollback proposal. DO NOT RUN IN PRODUCTION without Paul's explicit approval.
-- Destructive: drops B1 settings, threads, and idempotency receipts.
drop table if exists public.agent_send_receipts;
drop table if exists public.agent_threads;
drop table if exists public.agent_page_settings;
drop function if exists private.agent_page_settings_stamp();
