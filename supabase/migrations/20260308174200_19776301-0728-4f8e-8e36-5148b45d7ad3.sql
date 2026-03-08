
CREATE TABLE public.daily_mixes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  mix_index integer NOT NULL DEFAULT 0,
  mix_label text NOT NULL DEFAULT 'Daily Mix',
  top_artists text[] NOT NULL DEFAULT '{}',
  genre_tags text[] NOT NULL DEFAULT '{}',
  tracks jsonb NOT NULL DEFAULT '[]',
  dominant_color text,
  cover_url text,
  generated_at timestamp with time zone NOT NULL DEFAULT now(),
  expires_at timestamp with time zone NOT NULL DEFAULT (now() + interval '24 hours'),
  UNIQUE (user_id, mix_index)
);

ALTER TABLE public.daily_mixes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own mixes" ON public.daily_mixes
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own mixes" ON public.daily_mixes
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own mixes" ON public.daily_mixes
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own mixes" ON public.daily_mixes
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);
