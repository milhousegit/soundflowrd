-- Create table for artist playlists (permanently saved)
CREATE TABLE public.artist_playlists (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  artist_id TEXT NOT NULL,
  artist_name TEXT NOT NULL,
  playlist_id TEXT NOT NULL,
  playlist_title TEXT NOT NULL,
  playlist_cover_url TEXT,
  playlist_track_count INTEGER DEFAULT 0,
  playlist_type TEXT NOT NULL DEFAULT 'deezer', -- 'deezer' or 'local'
  position INTEGER NOT NULL DEFAULT 0,
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(artist_id, playlist_id)
);

-- Enable RLS
ALTER TABLE public.artist_playlists ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Anyone can view artist playlists"
ON public.artist_playlists
FOR SELECT
USING (true);

CREATE POLICY "Admins can insert artist playlists"
ON public.artist_playlists
FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update artist playlists"
ON public.artist_playlists
FOR UPDATE
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete artist playlists"
ON public.artist_playlists
FOR DELETE
USING (has_role(auth.uid(), 'admin'::app_role));

-- Add trigger for updated_at
CREATE TRIGGER update_artist_playlists_updated_at
BEFORE UPDATE ON public.artist_playlists
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();