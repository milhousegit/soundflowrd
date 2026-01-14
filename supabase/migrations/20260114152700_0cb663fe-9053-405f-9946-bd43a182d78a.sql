-- Add policy to allow viewing tracks in public playlists
CREATE POLICY "Anyone can view tracks in public playlists" 
ON public.playlist_tracks 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM public.playlists 
    WHERE playlists.id = playlist_tracks.playlist_id 
    AND playlists.is_public = true
  )
);