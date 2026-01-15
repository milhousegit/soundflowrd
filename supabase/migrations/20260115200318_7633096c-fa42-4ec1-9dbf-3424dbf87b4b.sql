-- Create table for artist merge mappings
CREATE TABLE public.artist_merges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  master_artist_id text NOT NULL,
  master_artist_name text NOT NULL,
  merged_artist_id text NOT NULL,
  merged_artist_name text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  created_by uuid NOT NULL,
  UNIQUE (merged_artist_id)
);

-- Enable RLS
ALTER TABLE public.artist_merges ENABLE ROW LEVEL SECURITY;

-- Anyone can view merges (needed for search filtering)
CREATE POLICY "Anyone can view artist merges"
ON public.artist_merges
FOR SELECT
USING (true);

-- Only admins can manage merges
CREATE POLICY "Admins can insert artist merges"
ON public.artist_merges
FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update artist merges"
ON public.artist_merges
FOR UPDATE
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete artist merges"
ON public.artist_merges
FOR DELETE
USING (has_role(auth.uid(), 'admin'::app_role));