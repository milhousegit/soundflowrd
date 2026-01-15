-- Table to store hidden items per artist (admin can hide tracks/albums/playlists)
CREATE TABLE public.artist_hidden_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  artist_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  item_type TEXT NOT NULL CHECK (item_type IN ('track', 'album', 'playlist')),
  item_title TEXT NOT NULL,
  hidden_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(artist_id, item_id, item_type)
);

-- Enable RLS
ALTER TABLE public.artist_hidden_items ENABLE ROW LEVEL SECURITY;

-- Anyone can view hidden items (needed to filter content)
CREATE POLICY "Anyone can view hidden items"
ON public.artist_hidden_items
FOR SELECT
USING (true);

-- Only admins can manage hidden items
CREATE POLICY "Admins can insert hidden items"
ON public.artist_hidden_items
FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete hidden items"
ON public.artist_hidden_items
FOR DELETE
USING (has_role(auth.uid(), 'admin'::app_role));