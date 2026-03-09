
-- Allow admins to insert playlists with any user_id (for system/chart playlists)
CREATE POLICY "Admins can insert any playlist"
ON public.playlists
FOR INSERT
TO authenticated
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Allow admins to delete any playlist (for managing chart playlists)
CREATE POLICY "Admins can delete any playlist"
ON public.playlists
FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- Allow admins to manage tracks in any playlist
CREATE POLICY "Admins can insert tracks in any playlist"
ON public.playlist_tracks
FOR INSERT
TO authenticated
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete tracks from any playlist"
ON public.playlist_tracks
FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can view all playlist tracks"
ON public.playlist_tracks
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));
