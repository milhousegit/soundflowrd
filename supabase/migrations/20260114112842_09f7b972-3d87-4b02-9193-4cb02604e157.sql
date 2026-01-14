-- Add is_public column to playlists table
ALTER TABLE public.playlists 
ADD COLUMN is_public boolean NOT NULL DEFAULT false;

-- Create policy to allow public access to public playlists
CREATE POLICY "Public playlists are viewable by everyone" 
ON public.playlists 
FOR SELECT 
USING (is_public = true);

-- Create table for metadata update requests
CREATE TABLE public.metadata_update_requests (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  track_id text NOT NULL,
  track_title text NOT NULL,
  track_artist text NOT NULL,
  requested_deezer_id text NOT NULL,
  requested_title text NOT NULL,
  requested_artist text NOT NULL,
  requested_album text,
  requested_cover_url text,
  requested_duration integer,
  request_type text NOT NULL DEFAULT 'metadata', -- 'metadata' or 'source'
  status text NOT NULL DEFAULT 'pending', -- 'pending', 'approved', 'rejected'
  user_id uuid NOT NULL,
  admin_notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS on metadata_update_requests
ALTER TABLE public.metadata_update_requests ENABLE ROW LEVEL SECURITY;

-- Users can view their own requests
CREATE POLICY "Users can view their own requests"
ON public.metadata_update_requests
FOR SELECT
USING (auth.uid() = user_id);

-- Users can create their own requests
CREATE POLICY "Users can create their own requests"
ON public.metadata_update_requests
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Admins can view all requests
CREATE POLICY "Admins can view all requests"
ON public.metadata_update_requests
FOR SELECT
USING (has_role(auth.uid(), 'admin'));

-- Admins can update all requests
CREATE POLICY "Admins can update all requests"
ON public.metadata_update_requests
FOR UPDATE
USING (has_role(auth.uid(), 'admin'));

-- Admins can delete all requests
CREATE POLICY "Admins can delete all requests"
ON public.metadata_update_requests
FOR DELETE
USING (has_role(auth.uid(), 'admin'));

-- Create trigger for updated_at
CREATE TRIGGER update_metadata_update_requests_updated_at
BEFORE UPDATE ON public.metadata_update_requests
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();