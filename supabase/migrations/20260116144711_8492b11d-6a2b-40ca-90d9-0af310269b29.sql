-- Create a table to store custom covers for Deezer playlists (admin only)
CREATE TABLE public.deezer_playlist_covers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  deezer_playlist_id TEXT NOT NULL UNIQUE,
  cover_url TEXT NOT NULL,
  updated_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.deezer_playlist_covers ENABLE ROW LEVEL SECURITY;

-- Anyone can view custom covers
CREATE POLICY "Anyone can view deezer playlist covers"
ON public.deezer_playlist_covers FOR SELECT
USING (true);

-- Only admins can insert covers
CREATE POLICY "Admins can insert deezer playlist covers"
ON public.deezer_playlist_covers FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Only admins can update covers
CREATE POLICY "Admins can update deezer playlist covers"
ON public.deezer_playlist_covers FOR UPDATE
USING (has_role(auth.uid(), 'admin'::app_role));

-- Only admins can delete covers
CREATE POLICY "Admins can delete deezer playlist covers"
ON public.deezer_playlist_covers FOR DELETE
USING (has_role(auth.uid(), 'admin'::app_role));

-- Trigger to update updated_at
CREATE TRIGGER update_deezer_playlist_covers_updated_at
BEFORE UPDATE ON public.deezer_playlist_covers
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();