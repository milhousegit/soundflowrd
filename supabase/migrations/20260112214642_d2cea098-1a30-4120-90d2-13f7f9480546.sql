-- Create recently_played table for syncing listening history
CREATE TABLE public.recently_played (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  track_id TEXT NOT NULL,
  track_title TEXT NOT NULL,
  track_artist TEXT NOT NULL,
  track_album TEXT,
  track_album_id TEXT,
  track_cover_url TEXT,
  track_duration INTEGER,
  artist_id TEXT,
  played_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(user_id, track_id)
);

-- Create index for fast queries by user and played_at
CREATE INDEX idx_recently_played_user_played 
  ON recently_played(user_id, played_at DESC);

-- Enable Row Level Security
ALTER TABLE recently_played ENABLE ROW LEVEL SECURITY;

-- RLS Policies for user management
CREATE POLICY "Users can view own recently played"
  ON recently_played FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own recently played"
  ON recently_played FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own recently played"
  ON recently_played FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own recently played"
  ON recently_played FOR DELETE
  USING (auth.uid() = user_id);