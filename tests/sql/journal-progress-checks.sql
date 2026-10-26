DO $$
DECLARE
  v_user uuid := '11111111-1111-4111-8111-111111111111';
  v_workspace uuid := '22222222-2222-4222-8222-222222222222';
  v_result jsonb;
  v_status text;
  v_seconds integer;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', v_user::text, true);

  v_result := public.journal_record_progress_batch(
    v_workspace,
    '33333333-3333-4333-8333-333333333331',
    '[{"editionId":"edition:threshold","itemId":"item:no-state","deltaSeconds":10,"position":0.1}]'::jsonb
  );
  SELECT status, seconds_read INTO v_status, v_seconds
    FROM public.feed_item_state
    WHERE user_id=v_user AND workspace_id=v_workspace
      AND edition_id='edition:threshold' AND item_id='item:no-state';
  IF v_result->>'duplicate' <> 'false' OR v_status <> 'new' OR v_seconds <> 10 THEN
    RAISE EXCEPTION '10 seconds without prior state must remain new at 10 seconds; result %, status %, seconds %', v_result, v_status, v_seconds;
  END IF;

  v_result := public.journal_record_progress_batch(
    v_workspace,
    '33333333-3333-4333-8333-333333333332',
    '[{"editionId":"edition:threshold","itemId":"item:no-state","deltaSeconds":20,"position":0.5}]'::jsonb
  );
  SELECT status, seconds_read INTO v_status, v_seconds
    FROM public.feed_item_state
    WHERE user_id=v_user AND workspace_id=v_workspace
      AND edition_id='edition:threshold' AND item_id='item:no-state';
  IF v_result->>'duplicate' <> 'false' OR v_status <> 'read' OR v_seconds <> 30 THEN
    RAISE EXCEPTION 'cumulative 30 seconds must mark read exactly at 30; result %, status %, seconds %', v_result, v_status, v_seconds;
  END IF;

  v_result := public.journal_record_progress_batch(
    v_workspace,
    '33333333-3333-4333-8333-333333333332',
    '[{"editionId":"edition:threshold","itemId":"item:no-state","deltaSeconds":20,"position":0.5}]'::jsonb
  );
  SELECT status, seconds_read INTO v_status, v_seconds
    FROM public.feed_item_state
    WHERE user_id=v_user AND workspace_id=v_workspace
      AND edition_id='edition:threshold' AND item_id='item:no-state';
  IF v_result->>'duplicate' <> 'true' OR v_status <> 'read' OR v_seconds <> 30 THEN
    RAISE EXCEPTION 'replaying the batch must be duplicate without double counting; result %, status %, seconds %', v_result, v_status, v_seconds;
  END IF;
END
$$;
