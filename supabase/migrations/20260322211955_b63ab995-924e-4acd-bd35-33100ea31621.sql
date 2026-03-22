CREATE TABLE public.artist_genres_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  artist_id text NOT NULL UNIQUE,
  artist_name text NOT NULL,
  genres text[] NOT NULL DEFAULT '{}',
  popularity integer DEFAULT 0,
  spotify_id text,
  image_url text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.artist_genres_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view artist genres cache" ON public.artist_genres_cache FOR SELECT TO public USING (true);
CREATE POLICY "Service role can manage artist genres cache" ON public.artist_genres_cache FOR ALL TO public USING (auth.role() = 'service_role'::text) WITH CHECK (auth.role() = 'service_role'::text);