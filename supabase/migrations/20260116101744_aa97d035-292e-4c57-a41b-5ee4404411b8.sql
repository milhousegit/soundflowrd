-- Create storage bucket for playlist covers
INSERT INTO storage.buckets (id, name, public)
VALUES ('playlist-covers', 'playlist-covers', true)
ON CONFLICT (id) DO NOTHING;

-- Allow anyone to view playlist covers (public bucket)
CREATE POLICY "Playlist covers are publicly accessible"
ON storage.objects
FOR SELECT
USING (bucket_id = 'playlist-covers');

-- Allow authenticated users to upload their own playlist covers
CREATE POLICY "Users can upload playlist covers"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'playlist-covers' 
  AND auth.uid() IS NOT NULL
);

-- Allow users to update their own covers or admins to update any
CREATE POLICY "Users can update their own playlist covers or admins can update any"
ON storage.objects
FOR UPDATE
USING (
  bucket_id = 'playlist-covers' 
  AND (
    auth.uid()::text = (storage.foldername(name))[1]
    OR EXISTS (
      SELECT 1 FROM public.user_roles 
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  )
);

-- Allow users to delete their own covers or admins to delete any
CREATE POLICY "Users can delete their own playlist covers or admins can delete any"
ON storage.objects
FOR DELETE
USING (
  bucket_id = 'playlist-covers' 
  AND (
    auth.uid()::text = (storage.foldername(name))[1]
    OR EXISTS (
      SELECT 1 FROM public.user_roles 
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  )
);