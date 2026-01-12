-- Add deezer_id column to playlists table for storing Deezer playlist references
ALTER TABLE public.playlists ADD COLUMN IF NOT EXISTS deezer_id TEXT DEFAULT NULL;

-- Create an index for faster lookups
CREATE INDEX IF NOT EXISTS idx_playlists_deezer_id ON public.playlists(deezer_id) WHERE deezer_id IS NOT NULL;