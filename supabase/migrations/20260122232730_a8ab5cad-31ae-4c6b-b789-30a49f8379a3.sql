-- Tabella statistiche per artista (un record per user+artist)
CREATE TABLE public.user_artist_stats (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  artist_id TEXT NOT NULL,
  artist_name TEXT NOT NULL,
  artist_image_url TEXT,
  total_seconds_listened INTEGER NOT NULL DEFAULT 0,
  total_plays INTEGER NOT NULL DEFAULT 0,
  last_played_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, artist_id)
);

-- Tabella statistiche per traccia (un record per user+track)
CREATE TABLE public.user_track_stats (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  track_id TEXT NOT NULL,
  track_title TEXT NOT NULL,
  track_artist TEXT NOT NULL,
  artist_id TEXT,
  track_album TEXT,
  track_album_id TEXT,
  track_cover_url TEXT,
  track_duration INTEGER,
  play_count INTEGER NOT NULL DEFAULT 0,
  total_seconds_listened INTEGER NOT NULL DEFAULT 0,
  last_played_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, track_id)
);

-- Enable RLS
ALTER TABLE public.user_artist_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_track_stats ENABLE ROW LEVEL SECURITY;

-- Policies per user_artist_stats
CREATE POLICY "Users can view own artist stats"
  ON public.user_artist_stats FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own artist stats"
  ON public.user_artist_stats FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own artist stats"
  ON public.user_artist_stats FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own artist stats"
  ON public.user_artist_stats FOR DELETE
  USING (auth.uid() = user_id);

-- Policies per user_track_stats
CREATE POLICY "Users can view own track stats"
  ON public.user_track_stats FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own track stats"
  ON public.user_track_stats FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own track stats"
  ON public.user_track_stats FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own track stats"
  ON public.user_track_stats FOR DELETE
  USING (auth.uid() = user_id);

-- Indexes per performance
CREATE INDEX idx_user_artist_stats_user_id ON public.user_artist_stats(user_id);
CREATE INDEX idx_user_artist_stats_total_seconds ON public.user_artist_stats(user_id, total_seconds_listened DESC);
CREATE INDEX idx_user_track_stats_user_id ON public.user_track_stats(user_id);
CREATE INDEX idx_user_track_stats_play_count ON public.user_track_stats(user_id, play_count DESC);

-- Trigger per updated_at
CREATE TRIGGER update_user_artist_stats_updated_at
  BEFORE UPDATE ON public.user_artist_stats
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_user_track_stats_updated_at
  BEFORE UPDATE ON public.user_track_stats
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();