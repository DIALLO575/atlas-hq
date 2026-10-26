CREATE SCHEMA auth;
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE TABLE auth.users (id uuid PRIMARY KEY);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

CREATE TABLE public.workspaces (id uuid PRIMARY KEY);
CREATE TABLE public.workspace_members (
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  role text NOT NULL,
  PRIMARY KEY (workspace_id, user_id)
);
CREATE TABLE public.journal_items (
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id),
  edition_id text NOT NULL,
  item_id text NOT NULL,
  PRIMARY KEY (workspace_id, edition_id, item_id)
);
CREATE TABLE public.feed_item_state (
  user_id uuid NOT NULL REFERENCES auth.users(id),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id),
  edition_id text NOT NULL,
  item_id text NOT NULL,
  status text NOT NULL DEFAULT 'new',
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, workspace_id, edition_id, item_id)
);

INSERT INTO auth.users VALUES ('11111111-1111-4111-8111-111111111111');
INSERT INTO public.workspaces VALUES ('22222222-2222-4222-8222-222222222222');
INSERT INTO public.workspace_members VALUES (
  '22222222-2222-4222-8222-222222222222',
  '11111111-1111-4111-8111-111111111111',
  'owner'
);
INSERT INTO public.journal_items VALUES
  ('22222222-2222-4222-8222-222222222222', 'edition:threshold', 'item:no-state');
