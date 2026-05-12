CREATE TABLE public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user','assistant','system')),
  content jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX messages_user_created_idx ON public.messages(user_id, created_at);

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users select own messages" ON public.messages
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "users insert own messages" ON public.messages
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users delete own messages" ON public.messages
  FOR DELETE TO authenticated USING (auth.uid() = user_id);