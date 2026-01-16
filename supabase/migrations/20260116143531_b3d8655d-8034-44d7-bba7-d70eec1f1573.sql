-- Add RLS policy for admins to update any playlist
CREATE POLICY "Admins can update all playlists"
ON public.playlists
FOR UPDATE
USING (has_role(auth.uid(), 'admin'::app_role));

-- Add RLS policy for admins to view all playlists
CREATE POLICY "Admins can view all playlists"
ON public.playlists
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));