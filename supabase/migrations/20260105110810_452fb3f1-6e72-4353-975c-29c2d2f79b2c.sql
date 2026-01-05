-- Create function to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create table to store album-torrent mappings
CREATE TABLE public.album_torrent_mappings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  album_id TEXT NOT NULL,
  album_title TEXT NOT NULL,
  artist_name TEXT NOT NULL,
  torrent_id TEXT NOT NULL,
  torrent_title TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(album_id)
);

-- Create table to store track-file mappings
CREATE TABLE public.track_file_mappings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  album_mapping_id UUID NOT NULL REFERENCES public.album_torrent_mappings(id) ON DELETE CASCADE,
  track_id TEXT NOT NULL,
  track_title TEXT NOT NULL,
  track_position INTEGER,
  file_id INTEGER NOT NULL,
  file_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(album_mapping_id, track_id)
);

-- Enable RLS
ALTER TABLE public.album_torrent_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.track_file_mappings ENABLE ROW LEVEL SECURITY;

-- Public read/write policies (no auth needed for this app)
CREATE POLICY "Anyone can view album mappings" 
ON public.album_torrent_mappings 
FOR SELECT 
USING (true);

CREATE POLICY "Anyone can create album mappings" 
ON public.album_torrent_mappings 
FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Anyone can update album mappings" 
ON public.album_torrent_mappings 
FOR UPDATE 
USING (true);

CREATE POLICY "Anyone can delete album mappings" 
ON public.album_torrent_mappings 
FOR DELETE 
USING (true);

CREATE POLICY "Anyone can view track mappings" 
ON public.track_file_mappings 
FOR SELECT 
USING (true);

CREATE POLICY "Anyone can create track mappings" 
ON public.track_file_mappings 
FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Anyone can update track mappings" 
ON public.track_file_mappings 
FOR UPDATE 
USING (true);

CREATE POLICY "Anyone can delete track mappings" 
ON public.track_file_mappings 
FOR DELETE 
USING (true);

-- Index for fast lookups
CREATE INDEX idx_album_mappings_album_id ON public.album_torrent_mappings(album_id);
CREATE INDEX idx_track_mappings_album ON public.track_file_mappings(album_mapping_id);
CREATE INDEX idx_track_mappings_track ON public.track_file_mappings(track_id);

-- Trigger for updated_at
CREATE TRIGGER update_album_mappings_updated_at
BEFORE UPDATE ON public.album_torrent_mappings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();